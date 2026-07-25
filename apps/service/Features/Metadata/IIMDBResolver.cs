namespace CineReel.Service.Features.Metadata;

/// <summary>
/// Where an IMDb ID came from. The scanner (ticket 22) records this so
/// a later upgrade from <see cref="IDKind.Synthetic"/> to
/// <see cref="IDKind.Tmdb"/> can rename the Jellyfin folder
/// (ADR 0007).
/// </summary>
public enum IDKind
{
    /// <summary>Resolved from an NFO file directly.</summary>
    Direct,
    /// <summary>Resolved via the TMDB lookup tier (ADR 0016).</summary>
    Tmdb,
    /// <summary>Synthesised locally via SHA-256 of (driveKey, drivePath).</summary>
    Synthetic,
}

/// <summary>
/// Result of an <see cref="IIMDBResolver.ResolveAsync"/> call.
/// </summary>
public sealed record ResolvedID(string Id, IDKind Kind);

public interface IIMDBResolver
{
    Task<ResolvedID> ResolveAsync(ParsedNfo parsedNfo, string driveKey, string drivePath, CancellationToken cancellationToken = default);
}
