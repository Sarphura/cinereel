using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using CineReel.Service.Infrastructure.HyperAgent.Generated;

namespace CineReel.Service.Infrastructure.HyperAgent;

public sealed class HyperAgentClient : IHyperAgentClient
{
    private readonly HttpClient _http;
    private readonly ILogger<HyperAgentClient> _logger;

    public HyperAgentClient(HttpClient http, ILogger<HyperAgentClient> logger)
    {
        _http = http ?? throw new ArgumentNullException(nameof(http));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    public Task<HealthResponse> GetHealthAsync(CancellationToken cancellationToken = default) =>
        SendJsonAsync<HealthResponse>(HttpMethod.Get, "/healthz", null, cancellationToken);

    public Task<HyperAgentVersionResponse> GetVersionAsync(CancellationToken cancellationToken = default) =>
        SendJsonAsync<HyperAgentVersionResponse>(HttpMethod.Get, "/v1/version", null, cancellationToken);

    public Task<IReadOnlyList<DriveDescriptor>> ListDrivesAsync(CancellationToken cancellationToken = default) =>
        SendJsonAsync<IReadOnlyList<DriveDescriptor>>(HttpMethod.Get, "/v1/drives", null, cancellationToken);

    public Task<HyperdriveEntry?> GetEntryAsync(string driveKey, string path, bool wait = true, CancellationToken cancellationToken = default) =>
        SendJsonAsync<HyperdriveEntry?>(HttpMethod.Get,
            $"/v1/drives/{driveKey}/entry?path={Uri.EscapeDataString(path)}&wait={wait.ToString().ToLowerInvariant()}", null, cancellationToken);

    public Task<TreeNode> GetTreeAsync(string driveKey, string prefix = "/", bool wait = true, CancellationToken cancellationToken = default) =>
        SendJsonAsync<TreeNode>(HttpMethod.Get,
            $"/v1/drives/{driveKey}/tree?prefix={Uri.EscapeDataString(prefix)}&wait={wait.ToString().ToLowerInvariant()}", null, cancellationToken);

    public async Task<HyperAgentFileResponse> ReadFileAsync(string driveKey, string path, long? rangeStart = null, long? rangeEnd = null, CancellationToken cancellationToken = default)
    {
        var response = await FilesRangeReadAsync(driveKey, path, rangeStart, rangeEnd, cancellationToken);
        if ((int)response.StatusCode >= 400)
        {
            throw new HttpRequestException($"Hyper Agent file read failed with HTTP {(int)response.StatusCode}", null, response.StatusCode);
        }
        return response;
    }

    public Task<IReadOnlyList<PeerInfo>> GetPeersAsync(CancellationToken cancellationToken = default) =>
        SendJsonAsync<IReadOnlyList<PeerInfo>>(HttpMethod.Get, "/v1/swarm/peers", null, cancellationToken);

    public Task<IdentityInfo> GetIdentityAsync(CancellationToken cancellationToken = default) =>
        SendJsonAsync<IdentityInfo>(HttpMethod.Get, "/v1/identity", null, cancellationToken);

    public async Task<CreateDriveResponse> CreateDriveAsync(string name, string type, CancellationToken cancellationToken = default)
    {
        var descriptor = await SendJsonAsync<DriveDescriptor>(HttpMethod.Post, "/v1/drives", new { name, type }, cancellationToken);
        return new CreateDriveResponse(descriptor.DriveKey, descriptor.Name, descriptor.Type, descriptor.IsLocal, descriptor.CreatedAt);
    }

    public async Task<FileWriteResponse> WriteFileAsync(string driveKey, string path, byte[] body, object? metadata = null, CancellationToken cancellationToken = default)
    {
        using var request = new HttpRequestMessage(HttpMethod.Put,
            $"/v1/drives/{driveKey}/file?path={Uri.EscapeDataString(path)}")
        {
            Content = new ByteArrayContent(body),
        };
        request.Content.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
        if (metadata is not null)
        {
            request.Headers.TryAddWithoutValidation("X-Metadata", JsonSerializer.Serialize(metadata, HyperAgentJson.Options));
        }
        return await SendJsonAsync<FileWriteResponse>(request, cancellationToken);
    }

    public Task<DeleteResponse> DeleteFileAsync(string driveKey, string path, bool recursive = false, CancellationToken cancellationToken = default) =>
        SendJsonAsync<DeleteResponse>(HttpMethod.Delete,
            $"/v1/drives/{driveKey}/file?path={Uri.EscapeDataString(path)}&recursive={recursive.ToString().ToLowerInvariant()}", null, cancellationToken);

    public Task<MountResponse> MountRemoteDriveAsync(string publicKey, CancellationToken cancellationToken = default) =>
        SendJsonAsync<MountResponse>(HttpMethod.Post, $"/v1/swarm/mount/{publicKey}", null, cancellationToken);

    public Task<UnmountResponse> UnmountRemoteDriveAsync(string publicKey, CancellationToken cancellationToken = default) =>
        SendJsonAsync<UnmountResponse>(HttpMethod.Post, $"/v1/swarm/unmount/{publicKey}", null, cancellationToken);

    public Task<AnnounceResponse> AnnounceAsync(bool wait = true, CancellationToken cancellationToken = default) =>
        SendJsonAsync<AnnounceResponse>(HttpMethod.Post, "/v1/swarm/announce", new { wait }, cancellationToken);

    public async Task<bool> HealthAsync(CancellationToken ct = default)
    {
        try
        {
            using var response = await _http.GetAsync("/healthz", ct);
            return response.IsSuccessStatusCode;
        }
        catch (Exception exception)
        {
            _logger.LogDebug(exception, "[hyper-agent] health probe failed");
            return false;
        }
    }

    public async Task<string> MountAsync(string publicKey, CancellationToken ct = default) =>
        (await MountRemoteDriveAsync(publicKey, ct)).DriveKey;

    public async Task<HyperAgentFileResponse> FilesRangeReadAsync(
        string driveKey,
        string path,
        long? rangeStart = null,
        long? rangeEnd = null,
        CancellationToken ct = default)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, $"/v1/files/{driveKey}{NormalizePath(path)}");
        if (rangeStart.HasValue || rangeEnd.HasValue)
        {
            request.Headers.Range = BuildRangeHeader(rangeStart, rangeEnd);
        }
        using var response = await _http.SendAsync(request, HttpCompletionOption.ResponseContentRead, ct);
        var body = await response.Content.ReadAsByteArrayAsync(ct);
        var contentRange = response.Content.Headers.ContentRange?.ToString();
        if (contentRange is null && response.Headers.TryGetValues("Content-Range", out var values))
        {
            contentRange = values.FirstOrDefault();
        }
        return new HyperAgentFileResponse(
            response.StatusCode,
            response.Content.Headers.ContentType?.MediaType ?? "application/octet-stream",
            response.Content.Headers.ContentLength,
            contentRange,
            body);
    }

    private async Task<T> SendJsonAsync<T>(HttpMethod method, string uri, object? body, CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(method, uri);
        if (body is not null)
        {
            request.Content = new StringContent(JsonSerializer.Serialize(body, HyperAgentJson.Options), Encoding.UTF8, "application/json");
        }
        return await SendJsonAsync<T>(request, cancellationToken);
    }

    private async Task<T> SendJsonAsync<T>(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        using var response = await _http.SendAsync(request, HttpCompletionOption.ResponseContentRead, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            await ThrowProblemAsync(response, cancellationToken);
        }
        return await response.Content.ReadFromJsonAsync<T>(HyperAgentJson.Options, cancellationToken)
            ?? throw new InvalidOperationException($"Hyper Agent {request.RequestUri} returned an empty body");
    }

    private static async Task ThrowProblemAsync(HttpResponseMessage response, CancellationToken cancellationToken)
    {
        ProblemEnvelope? problem = null;
        try
        {
            problem = await response.Content.ReadFromJsonAsync<ProblemEnvelope>(HyperAgentJson.Options, cancellationToken);
        }
        catch (JsonException) { }
        var type = new Uri(problem?.Type ?? "about:blank");
        var status = (int)response.StatusCode;
        var detail = problem?.Detail;
        if (type.AbsoluteUri.EndsWith("/invalid-drive-key", StringComparison.Ordinal)) throw new HyperAgentInvalidDriveKeyException(type, status, detail);
        if (type.AbsoluteUri.EndsWith("/drive-not-mounted", StringComparison.Ordinal)) throw new HyperAgentDriveNotMountedException(type, status, detail);
        throw new HyperAgentProblemException(type, status, detail);
    }

    private static string NormalizePath(string path)
    {
        if (string.IsNullOrEmpty(path)) return "/";
        var normalized = path.StartsWith('/') ? path : "/" + path;
        while (normalized.Contains("//", StringComparison.Ordinal)) normalized = normalized.Replace("//", "/", StringComparison.Ordinal);
        return normalized;
    }

    private static RangeHeaderValue BuildRangeHeader(long? start, long? end)
    {
        if (start.HasValue && end.HasValue) return new RangeHeaderValue(start.Value, end.Value);
        if (start.HasValue) return new RangeHeaderValue(start.Value, null);
        if (end.HasValue) return new RangeHeaderValue(0, end.Value - 1);
        throw new ArgumentException("Range requested without a boundary.");
    }

    private sealed record ProblemEnvelope(string? Type, string? Detail);
}
