using CineReel.Service.Data.Entities;
using CineReel.Service.Features.Subscription;
using CineReel.Service.Infrastructure.HyperAgent;
using CineReel.Service.Infrastructure.HyperAgent.Generated;
using Microsoft.Extensions.Logging;
using Xunit;

namespace CineReel.Service.Tests;

/// <summary>
/// Pin the recovery contract from ticket 19:
///   - Recovery is idempotent.
///   - Recovery failures do not crash the loop.
///   - The loop continues after a single "drive-not-mounted" return.
/// </summary>
public class SubscriptionRecoveryServiceTests
{
    private static readonly DateTimeOffset Now = new(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task RecoverAsync_EmptyStore_ReturnsZero()
    {
        var client = new StubHyperAgentWriteClient();
        var repo = new InMemorySubscriptionRepository();
        var service = NewService(repo, client);

        var ok = await service.RecoverAsync(new HyperAgentRecovered(Now, "1.0.0"));

        Assert.Equal(0, ok);
        Assert.Empty(client.MountCalls);
    }

    [Fact]
    public async Task RecoverAsync_AllSubscriptions_RemountsEach()
    {
        var client = new StubHyperAgentWriteClient();
        var repo = new InMemorySubscriptionRepository();
        await repo.AddAsync(new SubscriptionEntity { DriveKey = new string('a', 64), State = SubscriptionState.Active, SubscribedAt = Now });
        await repo.AddAsync(new SubscriptionEntity { DriveKey = new string('b', 64), State = SubscriptionState.Active, SubscribedAt = Now });

        var service = NewService(repo, client);

        var ok = await service.RecoverAsync(new HyperAgentRecovered(Now, "1.0.0"));

        Assert.Equal(2, ok);
        Assert.Equal(new[] { new string('a', 64), new string('b', 64) }, client.MountCalls);
    }

    [Fact]
    public async Task RecoverAsync_DriveNotMountedForOne_Continues()
    {
        var client = new StubHyperAgentWriteClient();
        client.Errors[new string('c', 64)] = new HyperAgentDriveNotMountedException(
            new Uri("https://cinereel.dev/errors/drive-not-mounted"),
            404,
            "drive not in registry");

        var repo = new InMemorySubscriptionRepository();
        await repo.AddAsync(new SubscriptionEntity { DriveKey = new string('a', 64), State = SubscriptionState.Active, SubscribedAt = Now });
        await repo.AddAsync(new SubscriptionEntity { DriveKey = new string('c', 64), State = SubscriptionState.Active, SubscribedAt = Now });
        await repo.AddAsync(new SubscriptionEntity { DriveKey = new string('b', 64), State = SubscriptionState.Active, SubscribedAt = Now });

        var service = NewService(repo, client);

        var ok = await service.RecoverAsync(new HyperAgentRecovered(Now, "1.0.0"));

        Assert.Equal(2, ok);
        Assert.Equal(new[] { new string('a', 64), new string('c', 64), new string('b', 64) }, client.MountCalls);
    }

    [Fact]
    public async Task RecoverAsync_AllFail_StillReturnsZeroAndDoesNotThrow()
    {
        var client = new StubHyperAgentWriteClient();
        var key = new string('d', 64);
        client.Errors[key] = new HyperAgentProblemException(
            new Uri("https://cinereel.dev/errors/internal"),
            500,
            "downstream");

        var repo = new InMemorySubscriptionRepository();
        await repo.AddAsync(new SubscriptionEntity { DriveKey = key, State = SubscriptionState.Active, SubscribedAt = Now });

        var service = NewService(repo, client);

        var ok = await service.RecoverAsync(new HyperAgentRecovered(Now, "1.0.0"));

        Assert.Equal(0, ok);
    }

    [Fact]
    public async Task RecoverAsync_Idempotent_UpdatesLastRemountedAt()
    {
        var client = new StubHyperAgentWriteClient();
        var key = new string('e', 64);
        var repo = new InMemorySubscriptionRepository();
        await repo.AddAsync(new SubscriptionEntity { DriveKey = key, State = SubscriptionState.Active, SubscribedAt = Now });

        var service = NewService(repo, client);

        await service.RecoverAsync(new HyperAgentRecovered(Now, "1.0.0"));
        await service.RecoverAsync(new HyperAgentRecovered(Now.AddSeconds(1), "1.0.0"));

        Assert.Equal(2, client.MountCalls.Count);
        var subs = await repo.ListAsync();
        Assert.Equal(Now.AddSeconds(1), subs[0].LastRemountedAt);
    }

    private static SubscriptionRecoveryService NewService(InMemorySubscriptionRepository repo, StubHyperAgentWriteClient client)
    {
        var provider = new StubServiceProviderWithWriter(client);
        return new SubscriptionRecoveryService(repo, provider, new TestLogger(), FakeTimeProvider.Instance);
    }

    private sealed class StubHyperAgentWriteClient : IHyperAgentWriteClient
    {
        public Dictionary<string, Exception> Errors { get; } = new();
        public List<string> MountCalls { get; } = new();

        public Task<CreateDriveResponse> CreateDriveAsync(string name, string type, CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();
        public Task<FileWriteResponse> WriteFileAsync(string driveKey, string path, byte[] body, object? metadata = null, CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();
        public Task<DeleteResponse> DeleteFileAsync(string driveKey, string path, bool recursive = false, CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();
        public Task<MountResponse> MountRemoteDriveAsync(string publicKey, CancellationToken cancellationToken = default)
        {
            MountCalls.Add(publicKey);
            if (Errors.TryGetValue(publicKey, out var ex))
            {
                throw ex;
            }
            return Task.FromResult(new MountResponse(publicKey));
        }
        public Task<UnmountResponse> UnmountRemoteDriveAsync(string publicKey, CancellationToken cancellationToken = default) =>
            Task.FromResult(new UnmountResponse(true));
        public Task<AnnounceResponse> AnnounceAsync(bool wait = true, CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();
    }

    private sealed class StubServiceProviderWithWriter : IServiceProvider
    {
        private readonly StubHyperAgentWriteClient _writer;
        public StubServiceProviderWithWriter(StubHyperAgentWriteClient writer) { _writer = writer; }
        public object? GetService(Type serviceType) => serviceType == typeof(IHyperAgentWriteClient) ? _writer : null;
    }

    private sealed class FakeTimeProvider : TimeProvider
    {
        public static readonly FakeTimeProvider Instance = new();
        public override DateTimeOffset GetUtcNow() => new(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);
    }

    private sealed class TestLogger : ILogger<SubscriptionRecoveryService>
    {
        public IDisposable BeginScope<TState>(TState state) where TState : notnull => NullScope.Instance;
        public bool IsEnabled(LogLevel logLevel) => true;
        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        {
        }

        private sealed class NullScope : IDisposable
        {
            public static readonly NullScope Instance = new();
            public void Dispose() { }
        }
    }
}
