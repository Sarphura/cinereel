using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace CineReel.Service.Features.Metadata;

/// <summary>
/// Thin TMDB client that calls <c>/search/movie</c> with title + year.
/// Tier 1 of the IMDb fallback chain — gated on
/// a configured API key. Returning <c>null</c> means "no result; the
/// caller should fall through to Tier 2".
/// </summary>
public sealed class TmdbClient
{
    private readonly HttpClient _http;
    private readonly string? _apiKey;

    public TmdbClient(HttpClient http, string? apiKey)
    {
        _http = http;
        _apiKey = apiKey;
    }

    public bool Enabled => !string.IsNullOrWhiteSpace(_apiKey);

    public async Task<string?> SearchMovieAsync(string title, int? year, CancellationToken cancellationToken = default)
    {
        if (!Enabled) return null;
        if (string.IsNullOrWhiteSpace(title)) return null;

        var queryString = new StringBuilder();
        queryString.Append($"?api_key={Uri.EscapeDataString(_apiKey!)}");
        queryString.Append($"&query={Uri.EscapeDataString(title)}");
        if (year.HasValue)
        {
            queryString.Append($"&year={year.Value.ToString(System.Globalization.CultureInfo.InvariantCulture)}");
        }

        using var request = new HttpRequestMessage(HttpMethod.Get, $"/3/search/movie{queryString}");
        using var response = await _http.SendAsync(request, cancellationToken).ConfigureAwait(false);
        if (response.StatusCode == HttpStatusCode.NotFound) return null;
        if (!response.IsSuccessStatusCode) return null;

        var payload = await response.Content.ReadFromJsonAsync<TmdbSearchResponse>(cancellationToken: cancellationToken).ConfigureAwait(false);
        var first = payload?.Results?.FirstOrDefault();
        if (first is null || string.IsNullOrWhiteSpace(first.ImdbId)) return null;
        return first.ImdbId;
    }
}

/// <summary>
/// Internal record mirroring the subset of TMDB's search response we
/// read. Only the first result is consumed.
/// </summary>
internal sealed class TmdbSearchResponse
{
    [JsonPropertyName("results")]
    public List<TmdbSearchResult>? Results { get; init; }
}

internal sealed class TmdbSearchResult
{
    [JsonPropertyName("id")]
    public long Id { get; init; }

    [JsonPropertyName("imdb_id")]
    public string? ImdbId { get; init; }

    [JsonPropertyName("title")]
    public string? Title { get; init; }

    [JsonPropertyName("release_date")]
    public string? ReleaseDate { get; init; }
}
