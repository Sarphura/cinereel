using CineReel.Service.Data.Entities;
using CineReel.Service.Domain.Common;
using CineReel.Service.Events;
using CineReel.Service.Features.Metadata;
using CineReel.Service.Features.Metadata.Events;
using CineReel.Service.Features.Subscription;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace CineReel.Service.Features.Recovery;

/// <summary>
/// Background reconciliation (ticket 32). Polls every 60 seconds;
/// re-publishes the original event for each failed subscription /
/// media item so handlers can attempt the action again.
/// </summary>
public sealed class FailedEntitySweeper : BackgroundService
{
    private readonly ISubscriptionRepository _subscriptions;
    private readonly IMediaItemRepository _media;
    private readonly IEntityFailureJournal _journal;
    private readonly IDomainEventBus _bus;
    private readonly ILogger<FailedEntitySweeper> _logger;
    private readonly TimeProvider _clock;
    private readonly TimeSpan _interval;

    public FailedEntitySweeper(
        ISubscriptionRepository subscriptions,
        IMediaItemRepository media,
        IEntityFailureJournal journal,
        IDomainEventBus bus,
        ILogger<FailedEntitySweeper> logger,
        TimeProvider? clock = null,
        TimeSpan? interval = null)
    {
        _subscriptions = subscriptions;
        _media = media;
        _journal = journal;
        _bus = bus;
        _logger = logger;
        _clock = clock ?? TimeProvider.System;
        _interval = interval ?? TimeSpan.FromSeconds(60);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await SweepAsync(stoppingToken);
            }
            catch (OperationCanceledException) { break; }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "failed-entity sweep failed");
            }
            try { await Task.Delay(_interval, stoppingToken); } catch (OperationCanceledException) { break; }
        }
    }

    public async Task SweepAsync(CancellationToken cancellationToken)
    {
        var allSubs = await _subscriptions.ListAsync(cancellationToken);
        foreach (var sub in allSubs.Where(s => s.State == SubscriptionState.Failed))
        {
            var entry = await _journal.FindAsync("subscription", sub.Id, cancellationToken);
            if (entry is null) continue;
            await _bus.PublishAsync(new SubscriptionRecovered(new SubscriptionId(sub.Id), sub.DriveKey, sub.DriveKey, _clock.GetUtcNow()), cancellationToken);
        }
        var allMedia = await _media.ListAllAsync(cancellationToken);
        foreach (var item in allMedia.Where(m => m.JellyfinState == JellyfinState.Failed))
        {
            var entry = await _journal.FindAsync("media_item", item.Id, cancellationToken);
            if (entry is null) continue;
            await _bus.PublishAsync(new MediaItemAdded(new MediaItemId(item.Id), new SubscriptionId(item.SubscriptionId), item.DriveKey, item.DrivePath, item.Title, item.ImdbId, _clock.GetUtcNow()), cancellationToken);
        }
    }
}