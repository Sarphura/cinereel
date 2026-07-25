using CineReel.Service.Data.Entities;
using CineReel.Service.Events;
using CineReel.Service.Features.Metadata;
using CineReel.Service.Features.Metadata.Events;
using CineReel.Service.Features.Recovery;
using CineReel.Service.Features.Subscription;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace CineReel.Service.Tests;

public sealed class FailedEntitySweeperTests
{
    [Fact]
    public async Task Sweep_re_publishes_for_failed_subscription()
    {
        var subs = new InMemorySubscriptionRepository();
        var media = new InMemoryMediaItemRepository();
        await subs.AddAsync(new SubscriptionEntity { Id = 1, DriveKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef", State = SubscriptionState.Failed, SubscribedAt = DateTimeOffset.UtcNow });
        var journal = new InMemoryEntityFailureJournal();
        await journal.RecordAsync("subscription", 1, "SubscriptionRecovered", "boom", DateTimeOffset.UtcNow);
        var bus = new SweeperRecordingBus();
        var sweeper = new FailedEntitySweeper(subs, media, journal, bus, NullLogger<FailedEntitySweeper>.Instance);

        await sweeper.SweepAsync(CancellationToken.None);

        Assert.Single(bus.Published);
        Assert.IsType<SubscriptionRecovered>(bus.Published[0]);
    }

    [Fact]
    public async Task Sweep_re_publishes_for_failed_media_item()
    {
        var subs = new InMemorySubscriptionRepository();
        var media = new InMemoryMediaItemRepository();
        await media.UpsertAsync(new MediaItemEntity { Id = 7, SubscriptionId = 1, DriveKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef", DrivePath = "/x", Title = "T", DescriptorHash = "h", JellyfinState = JellyfinState.Failed, TorrentPath = "/x/x.torrent", CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow });
        var journal = new InMemoryEntityFailureJournal();
        await journal.RecordAsync("media_item", 7, "MediaItemAdded", "boom", DateTimeOffset.UtcNow);
        var bus = new SweeperRecordingBus();
        var sweeper = new FailedEntitySweeper(subs, media, journal, bus, NullLogger<FailedEntitySweeper>.Instance);

        await sweeper.SweepAsync(CancellationToken.None);

        Assert.Single(bus.Published);
        Assert.IsType<MediaItemAdded>(bus.Published[0]);
    }
}

internal sealed class SweeperRecordingBus : CineReel.Service.Events.IDomainEventBus
{
    public List<CineReel.Service.Events.IDomainEvent> Published { get; } = new();
    public Task PublishAsync<TEvent>(TEvent evt, CancellationToken cancellationToken = default) where TEvent : CineReel.Service.Events.IDomainEvent
    {
        Published.Add(evt);
        return Task.CompletedTask;
    }
}