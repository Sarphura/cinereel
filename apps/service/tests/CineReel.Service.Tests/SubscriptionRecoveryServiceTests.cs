using CineReel.Service.Infrastructure.HyperAgent;
using CineReel.Service.Infrastructure.HyperAgent.Generated;
using Microsoft.Extensions.Logging;
using Xunit;

namespace CineReel.Service.Tests;

/// <summary>
/// Pin the recovery contract from ticket 17:
///   - Recovery is idempotent.
///   - Recovery failures do not crash the loop.
///   - The loop continues after a single "drive-not-mounted" return.
/// </summary>
public class SubscriptionRecoveryServiceTests
{
    private static readonly DateTime Now = new(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);

    [Fact]
    public async Task RecoverAsync_EmptyStore_ReturnsZero()
    {
        var client = new StubHyperAgentClient();
        var store = new InMemorySubscriptionStore();
        var service = new SubscriptionRecoveryService(
            client, store, new TestLogger());

        var ok = await service.RecoverAsync(new HyperAgentRecoveredEvent(Now, "1.0.0"));

        Assert.Equal(0, ok);
        Assert.Empty(client.MountCalls);
    }

    [Fact]
    public async Task RecoverAsync_AllSubscriptions_RemountsEach()
    {
        var client = new StubHyperAgentClient();
        var store = new InMemorySubscriptionStore();
        var subA = new Subscription(new string('a', 64), Now, Now);
        var subB = new Subscription(new string('b', 64), Now, Now);
        store.Seed(subA);
        store.Seed(subB);

        var service = new SubscriptionRecoveryService(
            client, store, new TestLogger());

        var ok = await service.RecoverAsync(new HyperAgentRecoveredEvent(Now, "1.0.0"));

        Assert.Equal(2, ok);
        Assert.Equal(new[] { subA.PublicKey, subB.PublicKey }, client.MountCalls);
    }

    [Fact]
    public async Task RecoverAsync_DriveNotMountedForOne_Continues()
    {
        var client = new StubHyperAgentClient();
        client.Errors[new string('c', 64)] = new HyperAgentDriveNotMountedException(
            new Uri("https://cinereel.dev/errors/drive-not-mounted"),
            404,
            "drive not in registry");

        var store = new InMemorySubscriptionStore();
        var subA = new Subscription(new string('a', 64), Now, Now);
        var subC = new Subscription(new string('c', 64), Now, Now);
        var subB = new Subscription(new string('b', 64), Now, Now);
        store.Seed(subA);
        store.Seed(subC);
        store.Seed(subB);

        var service = new SubscriptionRecoveryService(
            client, store, new TestLogger());

        var ok = await service.RecoverAsync(new HyperAgentRecoveredEvent(Now, "1.0.0"));

        Assert.Equal(2, ok);
        Assert.Equal(new[] { subA.PublicKey, subC.PublicKey, subB.PublicKey }, client.MountCalls);
        // The recovery service must NOT crash even if one mount fails.
    }

    [Fact]
    public async Task RecoverAsync_AllFail_StillReturnsZeroAndDoesNotThrow()
    {
        var client = new StubHyperAgentClient();
        var key = new string('d', 64);
        client.Errors[key] = new HyperAgentProblemException(
            new Uri("https://cinereel.dev/errors/internal"),
            500,
            "downstream");

        var store = new InMemorySubscriptionStore();
        store.Seed(new Subscription(key, Now, Now));

        var service = new SubscriptionRecoveryService(
            client, store, new TestLogger());

        var ok = await service.RecoverAsync(new HyperAgentRecoveredEvent(Now, "1.0.0"));

        Assert.Equal(0, ok);
    }

    [Fact]
    public async Task RecoverAsync_Idempotent_Remounting()
    {
        // The recovery service is idempotent in two ways:
        //   1. Calling RecoverAsync twice with the same input re-mounts
        //      the same set (acceptable — the Hyper Agent is itself
        //      idempotent on /v1/swarm/mount).
        //   2. LastReMountedAt is updated after a successful mount.
        var client = new StubHyperAgentClient();
        var store = new InMemorySubscriptionStore();
        var key = new string('e', 64);
        var sub = new Subscription(key, Now, Now);
        store.Seed(sub);

        var service = new SubscriptionRecoveryService(
            client, store, new TestLogger());

        await service.RecoverAsync(new HyperAgentRecoveredEvent(Now, "1.0.0"));
        await service.RecoverAsync(new HyperAgentRecoveredEvent(Now.AddSeconds(1), "1.0.0"));

        Assert.Equal(2, client.MountCalls.Count);
        var subs = await store.ListAsync();
        Assert.Equal(Now.AddSeconds(1), subs[0].LastReMountedAt);
    }

    private sealed class StubHyperAgentClient : IHyperAgentClient
    {
        public Dictionary<string, Exception> Errors { get; } = new();
        public List<string> MountCalls { get; } = new();

        public Task<string> MountAsync(string publicKey, CancellationToken ct = default)
        {
            MountCalls.Add(publicKey);
            if (Errors.TryGetValue(publicKey, out var ex))
            {
                throw ex;
            }
            return Task.FromResult(new string('f', 64));
        }

        // Members that don't matter for recovery tests.
        public Task<HyperAgentVersionResponse> GetVersionAsync(CancellationToken ct = default) =>
            throw new NotImplementedException();
        public Task<bool> HealthAsync(CancellationToken ct = default) =>
            throw new NotImplementedException();
        public Task<HyperAgentFileResponse> FilesRangeReadAsync(
            string driveKey, string path, long? rangeStart = null, long? rangeEnd = null,
            CancellationToken ct = default) => throw new NotImplementedException();
    }

    private sealed class TestLogger : ILogger<SubscriptionRecoveryService>
    {
        public IDisposable BeginScope<TState>(TState state) where TState : notnull => NullScope.Instance;
        public bool IsEnabled(LogLevel logLevel) => true;
        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        {
            // Visible only on test failure — xUnit captures stdout.
            // eslint-disable-next-line no-console
            Console.WriteLine($"[{logLevel}] {formatter(state, exception)}");
        }

        private sealed class NullScope : IDisposable
        {
            public static readonly NullScope Instance = new();
            public void Dispose() { }
        }
    }
}
