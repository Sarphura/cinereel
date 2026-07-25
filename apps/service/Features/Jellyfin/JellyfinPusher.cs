using CineReel.Service.Data.Entities;
using CineReel.Service.Domain.Common;
using CineReel.Service.Events;
using CineReel.Service.Features.Metadata;
using CineReel.Service.Features.Metadata.Events;
using CineReel.Service.Infrastructure.HyperAgent;
using Microsoft.Extensions.Logging;

namespace CineReel.Service.Features.Jellyfin;

public interface IJellyfinPusher
{
    Task<JellyfinPushOutcome> PushAsync(MediaItemEntity mediaItem, CancellationToken cancellationToken = default);
    Task RemoveAsync(MediaItemEntity mediaItem, CancellationToken cancellationToken = default);
}

public enum JellyfinPushOutcome
{
    Pushed,
    Skipped,
    Failed,
}

public sealed class JellyfinPusher : IJellyfinPusher, IDomainEventHandler<MediaItemAdded>
{
    private readonly IJellyfinHttpClient _http;
    private readonly IMediaItemRepository _media;
    private readonly IHyperAgentReadClient _reader;
    private readonly AsyncKeyedLock _locks = new();
    private readonly ILogger<JellyfinPusher> _logger;
    private readonly TimeProvider _clock;

    public JellyfinPusher(IJellyfinHttpClient http, IMediaItemRepository media, IHyperAgentReadClient reader, ILogger<JellyfinPusher> logger, TimeProvider? clock = null)
    {
        _http = http;
        _media = media;
        _reader = reader ?? throw new ArgumentNullException(nameof(reader));
        _logger = logger;
        _clock = clock ?? TimeProvider.System;
    }

    public Task HandleAsync(MediaItemAdded evt, CancellationToken cancellationToken)
    {
        // Caller already persists; load the row to drive PushAsync.
        return Task.CompletedTask;
    }

    public async Task<JellyfinPushOutcome> PushAsync(MediaItemEntity mediaItem, CancellationToken cancellationToken = default)
    {
        var folder = JellyfinFolderName.Build(mediaItem.Title, mediaItem.Year, mediaItem.ImdbId ?? string.Empty);

        try
        {
            await _locks.RunAsync(folder, async ct =>
            {
                var files = new Dictionary<string, byte[]>();
                if (!string.IsNullOrEmpty(mediaItem.PosterPath) && mediaItem.PosterPath.StartsWith("/"))
                {
                    try
                    {
                        var poster = await _reader.ReadFileAsync(mediaItem.DriveKey, mediaItem.PosterPath, cancellationToken: ct);
                        files["poster.jpg"] = poster.Body;
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "poster read failed for {Id}", mediaItem.Id);
                    }
                }

                if (!string.IsNullOrEmpty(mediaItem.NfoPath) && mediaItem.NfoPath.StartsWith("/"))
                {
                    try
                    {
                        var nfo = await _reader.ReadFileAsync(mediaItem.DriveKey, mediaItem.NfoPath, cancellationToken: ct);
                        files["movie.nfo"] = nfo.Body;
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "nfo read failed for {Id}", mediaItem.Id);
                    }
                }

                if (!string.IsNullOrEmpty(mediaItem.TorrentPath) && mediaItem.TorrentPath.StartsWith("/"))
                {
                    try
                    {
                        var torrent = await _reader.ReadFileAsync(mediaItem.DriveKey, mediaItem.TorrentPath, cancellationToken: ct);
                        files["movie.torrent"] = torrent.Body;
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "torrent read failed for {Id}", mediaItem.Id);
                    }
                }

                await _http.PushFilesAsync(folder, files, ct);
            }, cancellationToken);

            mediaItem.JellyfinState = JellyfinState.Pushed;
            mediaItem.JellyfinPath = folder;
            mediaItem.UpdatedAt = _clock.GetUtcNow();
            await _media.UpsertAsync(mediaItem, cancellationToken);
            return JellyfinPushOutcome.Pushed;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Jellyfin push failed for {Id}", mediaItem.Id);
            mediaItem.JellyfinState = JellyfinState.Failed;
            mediaItem.UpdatedAt = _clock.GetUtcNow();
            await _media.UpsertAsync(mediaItem, cancellationToken);
            return JellyfinPushOutcome.Failed;
        }
    }

    public async Task RemoveAsync(MediaItemEntity mediaItem, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrEmpty(mediaItem.JellyfinPath)) return;
        var folder = mediaItem.JellyfinPath;
        await _locks.RunAsync(folder, async ct =>
        {
            await _http.RemoveFolderAsync(folder, ct);
        }, cancellationToken);
        mediaItem.JellyfinState = JellyfinState.Pending;
        mediaItem.JellyfinPath = null;
        mediaItem.UpdatedAt = _clock.GetUtcNow();
        await _media.UpsertAsync(mediaItem, cancellationToken);
    }
}