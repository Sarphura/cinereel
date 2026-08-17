namespace CineReel.Service.Features.Metadata;

/// <summary>
/// Result of parsing a Kodi-style <c>movie.nfo</c> via XDocument.
/// Only fields Cinereel actually uses are
/// exposed; everything else lives in <see cref="Raw"/>.
/// </summary>
public sealed record ParsedNfo(
    string Title,
    string? OriginalTitle,
    int? Year,
    string? ImdbId,
    int? RuntimeMinutes,
    string? Plot,
    IReadOnlyList<string> Genres,
    IReadOnlyList<NfoPerson> Directors,
    IReadOnlyList<NfoPerson> Actors,
    IReadOnlyList<string> Studios,
    string? TrailerUrl,
    string? PosterPath,
    string? FanartPath,
    string? Mpaa,
    IReadOnlyList<string> Tags,
    NfoRawFields Raw);
