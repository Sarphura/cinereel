using CineReel.Service.Infrastructure.HyperAgent.Generated;
using Microsoft.Extensions.Logging;

namespace CineReel.Service.Infrastructure.HyperAgent;

/// <summary>
/// A row in the App Server's subscriptions table. One row per
/// remote-mount subscription — the Hyper Agent knows how to find a
/// peer by public key, but the App Server remembers which
/// subscriptions the user has actually requested (ADR 0050).
/// </summary>
public sealed record Subscription(
    string PublicKey,
    DateTime CreatedAt,
    DateTime LastReMountedAt);

/// <summary>
/// Storage for subscriptions. The default implementation persists in
/// SQLite; tests inject an in-memory fake. The recovery service
/// only depends on this interface.
/// </summary>
public interface ISubscriptionStore
{
    /// <summary>Snapshot all active subscriptions.</summary>
    Task<IReadOnlyList<Subscription>> ListAsync(CancellationToken ct = default);

    /// <summary>
    /// Mark a subscription as re-mounted. Used by the recovery
    /// service so the UI can show "last remounted at" timestamps.
    /// </summary>
    Task MarkRemountedAsync(string publicKey, DateTime at, CancellationToken ct = default);
}

/// <summary>
/// In-memory <see cref="ISubscriptionStore"/>. Used by tests and as
/// the default when the App Server is started without a
/// configured SQLite path. The ticket 17 AC requirement is the
/// idempotent retry loop; the persistence choice is orthogonal.
/// </summary>
public sealed class InMemorySubscriptionStore : ISubscriptionStore
{
    private readonly Dictionary<string, Subscription> _store = new(StringComparer.Ordinal);

    public void Seed(Subscription sub) => _store[sub.PublicKey] = sub;

    public Task<IReadOnlyList<Subscription>> ListAsync(CancellationToken ct = default)
        => Task.FromResult<IReadOnlyList<Subscription>>(_store.Values.ToList());

    public Task MarkRemountedAsync(string publicKey, DateTime at, CancellationToken ct = default)
    {
        if (_store.TryGetValue(publicKey, out var existing))
        {
            _store[publicKey] = existing with { LastReMountedAt = at };
        }
        return Task.CompletedTask;
    }
}

/// <summary>
/// Lifecycle event raised by the App Server when the Hyper Agent
/// has been observed as (a) reachable on <c>/healthz</c> and
/// (b) reporting the expected version on <c>/v1/version</c>. The
/// <see cref="SubscriptionRecoveryService"/> subscribes to this
/// event and re-mounts every active subscription.
/// </summary>
public sealed class HyperAgentRecoveredEvent
{
    public DateTime ObservedAt { get; }
    public string ReportedVersion { get; }

    public HyperAgentRecoveredEvent(DateTime observedAt, string reportedVersion)
    {
        ObservedAt = observedAt;
        ReportedVersion = reportedVersion;
    }
}

/// <summary>
/// Re-mounts every active subscription after the Hyper Agent
/// recovers. Idempotent — a subscription already mounted is a
/// no-op (the Hyper Agent returns "drive-not-mounted" only when
/// the drive is not in the registry, so a successful mount
/// call from the registry is a 200). Per ticket 17, a single
/// failure must NOT crash the loop; the failing driveKey is
/// logged and the loop continues.
/// </summary>
public sealed class SubscriptionRecoveryService
{
    private readonly IHyperAgentClient _client;
    private readonly ISubscriptionStore _store;
    private readonly ILogger<SubscriptionRecoveryService> _logger;

    public SubscriptionRecoveryService(
        IHyperAgentClient client,
        ISubscriptionStore store,
        ILogger<SubscriptionRecoveryService> logger)
    {
        _client = client ?? throw new ArgumentNullException(nameof(client));
        _store = store ?? throw new ArgumentNullException(nameof(store));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    /// <summary>
    /// Run the recovery pass. Reads every subscription, calls
    /// <c>POST /v1/swarm/mount/:publicKey</c>, and surfaces a
    /// non-fatal warning for each failure. Returns the number of
    /// subscriptions successfully re-mounted.
    /// </summary>
    public async Task<int> RecoverAsync(HyperAgentRecoveredEvent evt, CancellationToken ct = default)
    {
        var subs = await _store.ListAsync(ct);
        if (subs.Count == 0)
        {
            _logger.LogInformation(
                "[recovery] Hyper Agent recovered at {At} (version {Version}); no subscriptions to remount",
                evt.ObservedAt,
                evt.ReportedVersion);
            return 0;
        }

        _logger.LogInformation(
            "[recovery] Hyper Agent recovered at {At} (version {Version}); re-mounting {Count} subscription(s)",
            evt.ObservedAt,
            evt.ReportedVersion,
            subs.Count);

        var ok = 0;
        foreach (var sub in subs)
        {
            ct.ThrowIfCancellationRequested();
            try
            {
                await _client.MountAsync(sub.PublicKey, ct);
                await _store.MarkRemountedAsync(sub.PublicKey, evt.ObservedAt, ct);
                ok++;
            }
            catch (HyperAgentDriveNotMountedException ex)
            {
                // Already mounted is a no-op; the Hyper Agent returns
                // "drive-not-mounted" only when the drive is genuinely
                // missing. Logger at warning level so the operator
                // notices but the loop continues.
                _logger.LogWarning(
                    ex,
                    "[recovery] mount failed for {PublicKey}: drive not in registry",
                    sub.PublicKey);
            }
            catch (HyperAgentException ex)
            {
                _logger.LogWarning(
                    ex,
                    "[recovery] mount failed for {PublicKey}: {Status} {Type}",
                    sub.PublicKey,
                    ex.StatusCode,
                    ex.TypeUri);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(
                    ex,
                    "[recovery] unexpected error for {PublicKey}",
                    sub.PublicKey);
            }
        }

        _logger.LogInformation(
            "[recovery] remounted {Ok} of {Total} subscription(s)",
            ok,
            subs.Count);
        return ok;
    }
}
