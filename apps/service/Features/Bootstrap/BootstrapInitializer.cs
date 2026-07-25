using CineReel.Service.Data.Entities;
using CineReel.Service.Features.Accounts;
using CineReel.Service.Features.Subscription;
using CineReel.Service.Infrastructure.HyperAgent;
using CineReel.Service.Infrastructure.HyperAgent.Generated;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace CineReel.Service.Features.Bootstrap;

/// <summary>
/// First-launch experience (ADR 0063, ticket 24). After migrations
/// run and the Hyper Agent is reachable, the initializer checks if
/// <c>accounts</c> has any rows; if so, it returns immediately. On a
/// fresh install it seeds an <c>admin</c> account with a random
/// password written to <c>bootstrap-admin.txt</c>, creates the Demo
/// metadata drive via the Hyper Agent write client, and inserts a
/// subscription row pointing at it. On every subsequent startup
/// while <c>bootstrap-admin.txt</c> still exists, a warning is
/// logged so the operator is reminded to delete the file.
/// </summary>
public sealed class BootstrapInitializer : IHostedService
{
    private readonly IAccountRepository _accounts;
    private readonly ISubscriptionRepository _subscriptions;
    private readonly IServiceProvider _services;
    private readonly CinereelBootstrapOptions _options;
    private readonly IPasswordHasher _hasher;
    private readonly ILogger<BootstrapInitializer> _logger;
    private readonly TimeProvider _clock;
    private readonly Func<string>? _passwordFileOverride;

    public BootstrapInitializer(
        IAccountRepository accounts,
        ISubscriptionRepository subscriptions,
        IServiceProvider services,
        CinereelBootstrapOptions options,
        IPasswordHasher hasher,
        ILogger<BootstrapInitializer> logger,
        TimeProvider? clock = null,
        Func<string>? passwordFileOverride = null)
    {
        _accounts = accounts;
        _subscriptions = subscriptions;
        _services = services;
        _options = options;
        _hasher = hasher;
        _logger = logger;
        _clock = clock ?? TimeProvider.System;
        _passwordFileOverride = passwordFileOverride;
    }

    private IHyperAgentWriteClient? TryGetWriter()
        => _services.GetService(typeof(IHyperAgentWriteClient)) as IHyperAgentWriteClient;

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        var dataDir = _options.DataDir;
        Directory.CreateDirectory(dataDir);
        var passwordFile = _passwordFileOverride?.Invoke() ?? Path.Combine(dataDir, "bootstrap-admin.txt");

        var existing = await _accounts.ListAsync(cancellationToken);
        if (existing.Count > 0)
        {
            if (File.Exists(passwordFile))
            {
                _logger.LogWarning(
                    "bootstrap-admin.txt still present at {Path}; please delete it after first login.",
                    passwordFile);
            }
            return;
        }

        var password = RandomPasswordGenerator.Generate();
        await WritePasswordFile(passwordFile, password);
        _logger.LogWarning(
            "bootstrap admin password written to {Path}; please delete this file after first login.",
            passwordFile);

        var admin = new AccountEntity
        {
            Username = "admin",
            PasswordHash = _hasher.Hash(password),
            IsAdmin = true,
            Permissions = ["*"],
            Enabled = true,
            CreatedAt = _clock.GetUtcNow(),
            UpdatedAt = _clock.GetUtcNow(),
        };
        await _accounts.AddAsync(admin, cancellationToken);

        var writer = TryGetWriter();
        if (writer is null)
        {
            _logger.LogWarning("IHyperAgentWriteClient not registered; skipping demo drive bootstrap");
            _logger.LogInformation("Bootstrap complete. Admin password at {Path}", passwordFile);
            return;
        }

        try
        {
            var drive = await writer.CreateDriveAsync("demo", "metadata", cancellationToken);
            var subscription = new SubscriptionEntity
            {
                DriveKey = drive.DriveKey,
                Alias = "Demo",
                State = SubscriptionState.Active,
                SubscribedAt = _clock.GetUtcNow(),
            };
            await _subscriptions.AddAsync(subscription, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Demo drive bootstrap failed; admin account still created");
        }

        _logger.LogInformation("Bootstrap complete. Admin password at {Path}", passwordFile);
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    private static async Task WritePasswordFile(string path, string password)
    {
        await File.WriteAllTextAsync(path, password + Environment.NewLine).ConfigureAwait(false);
#if UNIX
        try
        {
            File.SetUnixFileMode(path, UnixFileMode.UserRead | UnixFileMode.UserWrite);
        }
        catch
        {
            // Filesystem does not support POSIX modes — leave default ACL.
        }
#endif
    }
}

public sealed class CinereelBootstrapOptions
{
    public string DataDir { get; set; } = "./";
}