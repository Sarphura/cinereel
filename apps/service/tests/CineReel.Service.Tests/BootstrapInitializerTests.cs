using CineReel.Service.Data.Entities;
using CineReel.Service.Features.Accounts;
using CineReel.Service.Features.Bootstrap;
using CineReel.Service.Features.Subscription;
using CineReel.Service.Infrastructure.HyperAgent;
using CineReel.Service.Infrastructure.HyperAgent.Generated;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace CineReel.Service.Tests;

public sealed class BootstrapInitializerTests
{
    [Fact]
    public async Task First_launch_seeds_admin_creates_demo_drive_subscribes()
    {
        var tmp = Path.Combine(Path.GetTempPath(), $"cinereel-bootstrap-{Guid.NewGuid():N}");
        Directory.CreateDirectory(tmp);
        try
        {
            var accounts = new InMemoryAccountRepository();
            var subscriptions = new InMemorySubscriptionRepository();
            var writer = new StubBootstrapWriter();
            var hasher = new Argon2idPasswordHasher();
            var passwordFile = Path.Combine(tmp, "bootstrap-admin.txt");
            var init = new BootstrapInitializer(accounts, subscriptions, writer,
                new CinereelBootstrapOptions { DataDir = tmp }, hasher,
                NullLogger<BootstrapInitializer>.Instance,
                StubBootstrapTime.Instance,
                passwordFileOverride: () => passwordFile);

            await init.StartAsync(CancellationToken.None);

            Assert.True(File.Exists(passwordFile));
            var seededPassword = await File.ReadAllTextAsync(passwordFile);
            seededPassword = seededPassword.Trim();
            Assert.True(hasher.Verify(seededPassword, (await accounts.ListAsync()).Single().PasswordHash));

            var sub = (await subscriptions.ListAsync()).Single();
            Assert.Equal(writer.CreatedDriveKey, sub.DriveKey);
            Assert.Equal(SubscriptionState.Active, sub.State);
        }
        finally
        {
            try { Directory.Delete(tmp, recursive: true); } catch { /* ignore */ }
        }
    }

    [Fact]
    public async Task Second_launch_is_idempotent_and_warns_when_password_file_persists()
    {
        var tmp = Path.Combine(Path.GetTempPath(), $"cinereel-bootstrap-{Guid.NewGuid():N}");
        Directory.CreateDirectory(tmp);
        try
        {
            var accounts = new InMemoryAccountRepository();
            await accounts.AddAsync(new AccountEntity { Username = "admin", PasswordHash = "x", IsAdmin = true, Permissions = ["*"], CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow });
            var passwordFile = Path.Combine(tmp, "bootstrap-admin.txt");
            await File.WriteAllTextAsync(passwordFile, "stale");

            var subscriptions = new InMemorySubscriptionRepository();
            var writer = new StubBootstrapWriter();
            var hasher = new Argon2idPasswordHasher();
            var init = new BootstrapInitializer(accounts, subscriptions, writer,
                new CinereelBootstrapOptions { DataDir = tmp }, hasher,
                NullLogger<BootstrapInitializer>.Instance,
                StubBootstrapTime.Instance,
                passwordFileOverride: () => passwordFile);

            await init.StartAsync(CancellationToken.None);

            // Admin row count unchanged; no new subscription row created.
            Assert.Single(await accounts.ListAsync());
            Assert.Empty(await subscriptions.ListAsync());
        }
        finally
        {
            try { Directory.Delete(tmp, recursive: true); } catch { /* ignore */ }
        }
    }
}

internal sealed class StubBootstrapWriter : IHyperAgentWriteClient
{
    public string CreatedDriveKey => "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    public Task<CreateDriveResponse> CreateDriveAsync(string name, string type, CancellationToken cancellationToken = default) =>
        Task.FromResult(new CreateDriveResponse(CreatedDriveKey, name, type, true, DateTimeOffset.UtcNow));
    public Task<FileWriteResponse> WriteFileAsync(string driveKey, string path, byte[] body, object? metadata = null, CancellationToken cancellationToken = default) =>
        Task.FromResult(new FileWriteResponse(true, body.Length));
    public Task<DeleteResponse> DeleteFileAsync(string driveKey, string path, bool recursive = false, CancellationToken cancellationToken = default) =>
        Task.FromResult(new DeleteResponse(true));
    public Task<MountResponse> MountRemoteDriveAsync(string publicKey, CancellationToken cancellationToken = default) =>
        Task.FromResult(new MountResponse(publicKey));
    public Task<UnmountResponse> UnmountRemoteDriveAsync(string publicKey, CancellationToken cancellationToken = default) =>
        Task.FromResult(new UnmountResponse(true));
    public Task<AnnounceResponse> AnnounceAsync(bool wait = true, CancellationToken cancellationToken = default) =>
        Task.FromResult(new AnnounceResponse(true));
}

internal sealed class StubBootstrapTime : TimeProvider
{
    public static readonly StubBootstrapTime Instance = new();
    public override DateTimeOffset GetUtcNow() => new(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);
}