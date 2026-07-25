using CineReel.Service.Data.Entities;
using Microsoft.Extensions.Logging;

namespace CineReel.Service.Features.Jellyfin;

public interface IJellyfinCleaner
{
    Task RemoveAsync(MediaItemEntity mediaItem, CancellationToken cancellationToken = default);
}

public sealed class JellyfinCleaner : IJellyfinCleaner
{
    private readonly IJellyfinPusher _pusher;

    public JellyfinCleaner(IJellyfinPusher pusher)
    {
        _pusher = pusher;
    }

    public Task RemoveAsync(MediaItemEntity mediaItem, CancellationToken cancellationToken = default) =>
        _pusher.RemoveAsync(mediaItem, cancellationToken);
}