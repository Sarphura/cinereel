namespace CineReel.Service.Features.Jellyfin;

/// <summary>
/// Canonical helpers for the on-disk folder name a <c>media_items</c>
/// row becomes once pushed to Jellyfin (ADR 0007). The folder is
/// <c>&lt;Title&gt; (&lt;Year&gt;) {imdb-&lt;id&gt;}</c> for direct matches
/// and <c>&lt;Title&gt; (&lt;Year&gt;) {local-&lt;16hex&gt;}</c> for
/// synthetic IDs (the latter is what the IMDB fallback chain in
/// ticket 21 produces).
/// </summary>
public static class JellyfinFolderName
{
    private static readonly char[] InvalidChars = ['/', '\\', ':', '*', '?', '"', '<', '>', '|'];

    public static string Sanitize(string title)
    {
        if (string.IsNullOrWhiteSpace(title)) return "_";
        var trimmed = title.Trim();
        var cleaned = new string(trimmed.Select(c => InvalidChars.Contains(c) ? '-' : c).ToArray());
        return cleaned.Length == 0 ? "_" : cleaned;
    }

    public static string Build(string title, int? year, string imdbId)
    {
        var safe = Sanitize(title);
        var yearPart = year.HasValue ? $" ({year.Value.ToString(System.Globalization.CultureInfo.InvariantCulture)})" : string.Empty;
        var tagPart = string.IsNullOrEmpty(imdbId) ? string.Empty : $" {{imdb-{imdbId}}}";
        return $"{safe}{yearPart}{tagPart}";
    }

    public static string BuildLocal(string title, int? year, string localId)
    {
        var safe = Sanitize(title);
        var yearPart = year.HasValue ? $" ({year.Value.ToString(System.Globalization.CultureInfo.InvariantCulture)})" : string.Empty;
        return $"{safe}{yearPart} {{{localId}}}";
    }
}