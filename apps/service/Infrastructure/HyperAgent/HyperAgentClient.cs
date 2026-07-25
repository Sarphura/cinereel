using System.Net;
using System.Net.Http.Headers;
using Microsoft.Extensions.Logging;

namespace CineReel.Service.Infrastructure.HyperAgent;

/// <summary>
/// Hand-rolled HTTP implementation of <see cref="IHyperAgentClient"/>.
/// This is the App Server's runtime client. The contract-freeze is
/// <see cref="Generated.HyperAgentClient"/> (NSwag-style); see
/// ticket 14. Any controller change in <c>apps/hyper-agent/</c> must
/// regenerate <c>apps/service/src/HyperAgent/HyperAgentClient.g.cs</c>
/// via <c>pnpm regen:hyper-agent-client</c>; the drift check fails CI
/// if the regenerated file differs from the committed one.
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

    public async Task<string> MountAsync(string publicKey, CancellationToken ct = default)
    {
        using var resp = await _http.PostAsync(
            $"/v1/swarm/mount/{publicKey}",
            content: null,
            ct);
        resp.EnsureSuccessStatusCode();
        var body = await resp.Content.ReadFromJsonAsync<MountResponse>(cancellationToken: ct)
            ?? throw new InvalidOperationException(
                $"Hyper Agent /v1/swarm/mount/{publicKey} returned an empty body");
        return body.DriveKey ?? throw new InvalidOperationException(
            $"Hyper Agent /v1/swarm/mount/{publicKey} returned no driveKey");
    }

    private sealed record MountResponse(string? DriveKey);

    public async Task<HyperAgentFileResponse> FilesRangeReadAsync(
        string driveKey,
        string path,
        long? rangeStart = null,
        long? rangeEnd = null,
        CancellationToken ct = default)
    {
        // Path-parameter style: the catch-all segment is the file path.
        // We pass `path` as-is; Hyperdrive paths use `/` (no spaces or
        // special chars at this layer) so no URL escaping.
        var url = $"/v1/files/{driveKey}{NormalizePath(path)}";
        using var req = new HttpRequestMessage(HttpMethod.Get, url);
        if (rangeStart.HasValue || rangeEnd.HasValue)
        {
            req.Headers.Range = BuildRangeHeader(rangeStart, rangeEnd);
        }
        using var resp = await _http.SendAsync(req, HttpCompletionOption.ResponseContentRead, ct);

        var body = await resp.Content.ReadAsByteArrayAsync(ct);
        // Content-Range is representation metadata and lands on the
        // content's Headers collection per RFC 9110. Some stacks also
        // surface it on the response headers; check both.
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
            // Suffix range: build as a "from 0 to end-1" range.
            return new RangeHeaderValue(0, end.Value - 1);
        }
        throw new ArgumentException("Range requested but neither start nor end was provided");
    }
}
