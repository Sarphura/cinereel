using System.Collections.Concurrent;
using CineReel.Service.Domain.Common;
using CineReel.Service.Events;
using CineReel.Service.Features.Metadata.Events;
using CineReel.Service.Features.Subscription.Events;
using Microsoft.Extensions.Logging;

namespace CineReel.Service.Features.Metadata;

/// <summary>
/// React to subscription lifecycle events by triggering a scan
/// (ticket 22). Re-entrant scans for the same subscription are
/// serialised via a <see cref="SemaphoreSlim"/>; scans across
/// different subscriptions run concurrently.
/// </summary>
public sealed class SubscriptionScanningOrchestrator :
    IDomainEventHandler<SubscriptionCreated>,
    IDomainEventHandler<SubscriptionDescriptorChanged>
{
    private readonly IMetadataScanner _scanner;
    private readonly ConcurrentDictionary<int, SemaphoreSlim> _locks = new();
    private readonly ILogger<SubscriptionScanningOrchestrator> _logger;

    public SubscriptionScanningOrchestrator(IMetadataScanner scanner, ILogger<SubscriptionScanningOrchestrator> logger)
    {
        _scanner = scanner;
        _logger = logger;
    }

    public Task HandleAsync(SubscriptionCreated evt, CancellationToken cancellationToken) =>
        ScanWithLockAsync(evt.Id, cancellationToken);

    public Task HandleAsync(SubscriptionDescriptorChanged evt, CancellationToken cancellationToken) =>
        ScanWithLockAsync(evt.SubscriptionId, cancellationToken);

    private async Task ScanWithLockAsync(SubscriptionId id, CancellationToken cancellationToken)
    {
        var gate = _locks.GetOrAdd(id.Value, _ => new SemaphoreSlim(1, 1));
        await gate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            _logger.LogInformation("[scan] begin subscription {Id}", id.Value);
            await _scanner.ScanAsync(id, cancellationToken).ConfigureAwait(false);
        }
        finally
        {
            gate.Release();
        }
    }
}
