using CineReel.Service.Data.Entities;
using CineReel.Service.Features.Metadata;
using Xunit;

namespace CineReel.Service.Tests;

public sealed class InMemoryRepositoryTests
{
    [Fact]
    public async Task Media_item_upsert_preserves_unique_subscription_path_pair()
    {
        var repository = new InMemoryMediaItemRepository();
        var first = await repository.UpsertAsync(NewItem("First"));
        var second = await repository.UpsertAsync(NewItem("Updated"));

        Assert.Equal(first.Id, second.Id);
        var items = await repository.ListBySubscriptionAsync(new Domain.Common.SubscriptionId(1));
        Assert.Single(items);
        Assert.Equal("Updated", items[0].Title);
    }

    private static MediaItemEntity NewItem(string title) => new()
    {
        SubscriptionId = 1,
        DriveKey = new string('a', 64),
        DrivePath = "movie",
        DescriptorHash = new string('b', 64),
        Title = title,
        TorrentPath = "movie/movie.torrent",
        CreatedAt = DateTimeOffset.UtcNow,
        UpdatedAt = DateTimeOffset.UtcNow,
    };
}
