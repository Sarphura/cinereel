using CineReel.Service.Data.Entities;
using CineReel.Service.Domain.Common;
using CineReel.Service.Events;
using CineReel.Service.Infrastructure.HyperAgent;
using CineReel.Service.Infrastructure.HyperAgent.Generated;
using Microsoft.Extensions.Logging;

namespace CineReel.Service.Features.Subscription;

/// <summary>
/// Domain event raised by the readiness watcher (ticket 16 lifecycle)
/// when both `/healthz` and `/v1/version` are green. Listeners are
/// responsible for whatever side-effects a Hyper Agent restart requires
/// — for subscriptions it's the recovery loop in
/// <see cref="SubscriptionRecoveryService"/>.
/// </summary>
public sealed record HyperAgentRecovered(DateTimeOffset ObservedAt, string ReportedVersion) : IDomainEvent;

/// <summary>
/// Re-mounts every active subscription after the Hyper Agent recovers
/// (ticket 19). The recovery pass is idempotent — drives already mounted
/// by the Hyper Agent return a 200 — and a single drive failure does
/// NOT crash the loop; the failing row is logged at warning level and
/// the loop continues.
/// </summary>
public sealed class SubscriptionRecoveryService : IDomainEventHandler<HyperAgentRecovered>
{
    private readonly ISubscriptionRepository _repository;
    private readonly IServiceProvider _services;
    private readonly ILogger<SubscriptionRecoveryService> _logger;
    private readonly TimeProvider _clock;

    public SubscriptionRecoveryService(
        ISubscriptionRepository repository,
        IServiceProvider services,
        ILogger<SubscriptionRecoveryService> logger,
        TimeProvider? clock = null)
    {
        _repository = repository;
        _services = services;
        _logger = logger;
        _clock = clock ?? TimeProvider.System;
    }

    private IHyperAgentWriteClient Writer =>
        _services.GetService(typeof(IHyperAgentWriteClient)) as IHyperAgentWriteClient
            ?? throw new InvalidOperationException("IHyperAgentWriteClient is not registered");

    public async Task HandleAsync(HyperAgentRecovered evt, CancellationToken cancellationToken = default)
    {
        await RecoverAsync(evt, cancellationToken);
    }

    /// <summary>
    /// Run the recovery pass. Returns the number of subscriptions
    /// successfully re-mounted. Backwards-compatible with the legacy
    /// test harness that called `RecoverAsync` directly.
    /// </summary>
    public async Task<int> RecoverAsync(HyperAgentRecovered evt, CancellationToken cancellationToken = default)
    {
        var subs = await _repository.ListAsync(cancellationToken);
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
            cancellationToken.ThrowIfCancellationRequested();
            try
            {
                await Writer.MountRemoteDriveAsync(sub.DriveKey, cancellationToken);
                await _repository.MarkRemountedAsync(new DriveKey(sub.DriveKey), evt.ObservedAt, cancellationToken);
                ok++;
            }
            catch (HyperAgentDriveNotMountedException ex)
            {
                _logger.LogWarning(
                    ex,
                    "[recovery] mount failed for {PublicKey}: drive not in registry",
                    sub.DriveKey);
            }
            catch (HyperAgentException ex)
            {
                _logger.LogWarning(
                    ex,
                    "[recovery] mount failed for {PublicKey}: {Status} {Type}",
                    sub.DriveKey,
                    ex.StatusCode,
                    ex.TypeUri);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(
                    ex,
                    "[recovery] unexpected error for {PublicKey}",
                    sub.DriveKey);
            }
        }

        _logger.LogInformation(
            "[recovery] remounted {Ok} of {Total} subscription(s)",
            ok,
            subs.Count);
        return ok;
    }
}
