using CineReel.Service.Data.Entities;
using CineReel.Service.Domain.Common;

namespace CineReel.Service.Features.Metadata;

/// <summary>
/// Scans a single subscription: read <c>/descriptor.json</c>, hash it,
/// walk the drive tree, parse every <c>movie.nfo</c>, resolve an IMDb
/// ID, and upsert the resulting <c>media_items</c> rows.
/// Returns a per-subscription descriptor hash. The scanner is the only
/// writer of <c>media_items.descriptor_hash</c>.
/// </summary>
public interface IMetadataScanner
{
    Task ScanAsync(SubscriptionId subscriptionId, CancellationToken cancellationToken = default);
}
