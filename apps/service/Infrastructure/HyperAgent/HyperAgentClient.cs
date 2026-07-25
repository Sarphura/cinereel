using System.Net;
using System.Net.Http.Headers;
using Microsoft.Extensions.Logging;

namespace CineReel.Service.Infrastructure.HyperAgent;

/// <summary>
/// Hand-rolled HTTP implementation of <see cref="IHyperAgentClient"/>.
/// This is the App Server's pre-NSwag client; ticket 14 will replace
/// it with a generated NSwag client that satisfies the same interface.
/// </summary>
public sealed class HyperAgentClient : IHyperAgentClient
{
    private readonly HttpClient _http;
    private readonly ILogger<HyperAgentClient> _logger;

    public HyperAgentClient(HttpClient http, ILogger<HyperAgentClient> logger)
    {
        _http = http ?? throw new ArgumentNullException(nameof(http));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    public async Task<HyperAgentVersionResponse> GetVersionAsync(CancellationToken ct = default)
    {
        using var resp = await _http.GetAsync("/v1/version", ct);
        resp.EnsureSuccessStatusCode();
        return await resp.Content.ReadFromJsonAsync<HyperAgentVersionResponse>(cancellationToken: ct)
            ?? throw new InvalidOperationException("Hyper Agent /v1/version returned an empty body");
    }

    public async Task<bool> HealthAsync(CancellationToken ct = default)
    {
        try
        {
            using var resp = await _http.GetAsync("/healthz", ct);
            return resp.IsSuccessStatusCode;
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "[hyper-agent] health probe failed");
            return false;
        }
    }

    public async Task<HyperAgentFileResponse> FilesRangeReadAsync(
        string driveKey,
        string path,
        long? rangeStart = null,
        long? rangeEnd = null,
        CancellationToken ct = default)
    {
        // The endpoint is path-parameter style: the catch-all
        // segment is the file path. We pass `path` as-is; the client
        // does not URL-encode it because Hyperdrive paths use `/`
        // (no spaces / special chars at this layer).
        var url = $"/v1/files/{driveKey}{NormalizePath(path)}";
        using var req = new HttpRequestMessage(HttpMethod.Get, url);
        if (rangeStart.HasValue || rangeEnd.HasValue)
        {
            req.Headers.Range = BuildRangeHeader(rangeStart, rangeEnd);
        }
        using var resp = await _http.SendAsync(req, HttpCompletionOption.ResponseContentRead, ct);

        var body = await resp.Content.ReadAsByteArrayAsync(ct);
        // Content-Range is a representation-metadata header and lands
        // on the content's Headers collection per RFC 9110. Some
        // HttpClient stacks surface it on the response headers too;
        // we check both so the migration does not depend on stack
        // quirks.
        string? contentRange = null;
        if (resp.Content.Headers.ContentRange is not null)
        {
            contentRange = $"bytes {resp.Content.Headers.ContentRange.From}-{resp.Content.Headers.ContentRange.To}/{resp.Content.Headers.ContentRange.Length}";
        }
        else if (resp.Headers.TryGetValues("Content-Range", out var vals))
        {
            contentRange = vals.FirstOrDefault();
        }
        return new HyperAgentFileResponse(
            StatusCode: resp.StatusCode,
            ContentType: resp.Content.Headers.ContentType?.MediaType ?? "application/octet-stream",
            ContentLength: resp.Content.Headers.ContentLength,
            ContentRange: contentRange,
            Body: body);
    }

    private static string NormalizePath(string path)
    {
        if (string.IsNullOrEmpty(path)) return "/";
        var p = path.StartsWith('/') ? path : "/" + path;
        // Collapse double slashes defensively.
        while (p.Contains("//")) p = p.Replace("//", "/");
        return p;
    }

    private static RangeHeaderValue BuildRangeHeader(long? start, long? end)
    {
        if (start.HasValue && end.HasValue)
        {
            return new RangeHeaderValue(start.Value, end.Value);
        }
        if (start.HasValue)
        {
            return new RangeHeaderValue(start.Value, null);
        }
        if (end.HasValue)
        {
            // Suffix range — both From and To must be set; From = end - length.
            // For suffix semantics we use To and a sentinel From=0 implicit
            // by leaving From null. RangeHeaderValue rejects From=null with
            // a non-null To in some .NET versions; fall back to using To
            // with a small length argument via a fresh RangeHeaderValue.
            var length = end.Value;
            return new RangeHeaderValue(0, length - 1);
        }
        throw new ArgumentException("Range requested but neither start nor end was provided");
    }
}
