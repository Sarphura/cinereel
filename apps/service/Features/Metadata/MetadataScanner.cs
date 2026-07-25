using CineReel.Service.Data.Entities;
using CineReel.Service.Domain.Common;
using CineReel.Service.Events;
using CineReel.Service.Features.Metadata.Events;
using CineReel.Service.Features.Subscription;
using CineReel.Service.Infrastructure.HyperAgent;
using CineReel.Service.Infrastructure.HyperAgent.Generated;
using Microsoft.Extensions.Logging;

namespace CineReel.Service.Features.Metadata;

/// <summary>
/// Default scan implementation for ticket 22. The scanner pulls every
/// <c>movie.nfo</c> it finds under a subscription's drive, parses via
/// <see cref="INfoParser"/>, resolves an IMDb ID via
/// <see cref="IIMDBResolver"/>, and upserts a <c>media_items</c> row.
/// A successful descriptor read stamps
/// <c>subscriptions.last_descriptor_seen_at</c>; the scanner
/// short-circuits when no <c>media_items</c> rows exist for the
/// subscription yet (first-scan forced pass).
/// </summary>
public sealed class MetadataScanner : IMetadataScanner
{
    private readonly ISubscriptionRepository _subscriptions;
    private readonly IMediaItemRepository _media;
    private readonly IServiceProvider _services;
    private readonly INfoParser _parser;
    private readonly IIMDBResolver _resolver;
    private readonly IDomainEventBus _bus;
    private readonly ILogger<MetadataScanner> _logger;
    private readonly TimeProvider _clock;

    public MetadataScanner(
        ISubscriptionRepository subscriptions,
        IMediaItemRepository media,
        IServiceProvider services,
        INfoParser parser,
        IIMDBResolver resolver,
        IDomainEventBus bus,
        ILogger<MetadataScanner> logger,
        TimeProvider? clock = null)
    {
        _subscriptions = subscriptions;
        _media = media;
        _services = services;
        _parser = parser;
        _resolver = resolver;
        _bus = bus;
        _logger = logger;
        _clock = clock ?? TimeProvider.System;
    }

    private IHyperAgentReadClient Reader =>
        _services.GetService(typeof(IHyperAgentReadClient)) as IHyperAgentReadClient
            ?? throw new InvalidOperationException("IHyperAgentReadClient is not registered");

    public async Task ScanAsync(SubscriptionId subscriptionId, CancellationToken cancellationToken = default)
    {
        var subscription = await _subscriptions.FindByIdAsync(subscriptionId, cancellationToken)
            ?? throw new InvalidOperationException($"subscription {subscriptionId.Value} not found");

        var driveKey = subscription.DriveKey;

        // Read /descriptor.json. If it isn't reachable, mark the
        // subscription failed and let the recovery loop retry later.
        HyperAgentFileResponse descriptor;
        try
        {
            descriptor = await Reader.ReadFileAsync(driveKey, "/descriptor.json", cancellationToken: cancellationToken);
        }
        catch (HyperAgentException ex)
        {
            _logger.LogWarning(ex, "[scan] descriptor read failed for {DriveKey}", driveKey);
            return;
        }

        var currentHash = DescriptorHashComputer.ComputeDescriptorHash(driveKey, descriptor.Body);
        var now = _clock.GetUtcNow();

        var existing = await _media.ListBySubscriptionAsync(subscriptionId, cancellationToken);
        var hasPrior = existing.Count > 0;

        if (hasPrior)
        {
            var priorHash = existing[0].DescriptorHash;
            if (string.Equals(priorHash, currentHash, StringComparison.Ordinal))
            {
                subscription.LastDescriptorSeenAt = now;
                _logger.LogInformation("[scan] descriptor unchanged for {DriveKey}", driveKey);
                return;
            }

            await _bus.PublishAsync(new SubscriptionDescriptorChanged(
                subscriptionId,
                driveKey,
                priorHash,
                currentHash,
                now), cancellationToken);
        }

        // Walk the drive tree and parse every movie.nfo we find.
        var tree = await Reader.GetTreeAsync(driveKey, "/", cancellationToken: cancellationToken);
        var folders = EnumerateFolders(tree).ToList();

        foreach (var folder in folders)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var drivePath = $"{folder}/movie.nfo";
            HyperAgentFileResponse nfoFile;
            try
            {
                nfoFile = await Reader.ReadFileAsync(driveKey, drivePath, cancellationToken: cancellationToken);
            }
            catch (HyperAgentException)
            {
                _logger.LogDebug("[scan] no movie.nfo at {DrivePath}", drivePath);
                continue;
            }

            ParsedNfo nfo;
            try
            {
                using var stream = new MemoryStream(nfoFile.Body);
                nfo = await _parser.ParseAsync(driveKey, drivePath, stream, cancellationToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogWarning(ex, "[scan] nfo parse failed at {DrivePath}", drivePath);
                continue;
            }

            var resolved = await _resolver.ResolveAsync(nfo, driveKey, drivePath, cancellationToken);
            var kind = ParseKind(nfo);
            var item = new MediaItemEntity
            {
                SubscriptionId = subscriptionId.Value,
                DriveKey = driveKey,
                DrivePath = folder,
                DescriptorHash = currentHash,
                ImdbId = resolved.Id,
                Title = nfo.Title,
                OriginalTitle = nfo.OriginalTitle,
                Year = nfo.Year,
                Kind = kind,
                PosterPath = nfo.PosterPath,
                TorrentPath = $"{folder}/movie.torrent",
                CreatedAt = now,
                UpdatedAt = now,
                LastScannedAt = now,
            };

            var saved = await _media.UpsertAsync(item, cancellationToken);
            await _bus.PublishAsync(new MediaItemAdded(
                new MediaItemId(saved.Id),
                subscriptionId,
                driveKey,
                folder,
                saved.Title,
                saved.ImdbId,
                now), cancellationToken);
        }

        subscription.LastDescriptorSeenAt = now;
        await _subscriptions.MarkDescriptorSeenAsync(subscriptionId, now, cancellationToken);
    }

    private static IEnumerable<string> EnumerateFolders(TreeNode node)
    {
        if (node.Type == "directory" && !string.IsNullOrEmpty(node.Name))
        {
            yield return "/" + node.Name;
        }

        if (node.Children is not null)
        {
            foreach (var child in node.Children)
            {
                var prefix = string.IsNullOrEmpty(node.Name) ? "" : "/" + node.Name;
                foreach (var inner in WalkTree(child, prefix))
                {
                    yield return inner;
                }
            }
        }
    }

    private static IEnumerable<string> WalkTree(TreeNode node, string prefix)
    {
        var path = $"{prefix}/{node.Name}";
        if (node.Type == "directory")
        {
            yield return path;
        }

        if (node.Children is not null)
        {
            foreach (var child in node.Children)
            {
                foreach (var inner in WalkTree(child, path))
                {
                    yield return inner;
                }
            }
        }
    }

    private static MediaItemKind ParseKind(ParsedNfo nfo) => MediaItemKind.Movie;
}
