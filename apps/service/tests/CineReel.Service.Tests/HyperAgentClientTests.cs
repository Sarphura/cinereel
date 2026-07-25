using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using CineReel.Service.Infrastructure.HyperAgent;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace CineReel.Service.Tests;

/// <summary>
/// Unit tests for the hand-rolled <see cref="HyperAgentClient"/>
/// (ticket 12). The client is the App Server's pre-NSwag typed
/// surface for the Hyper Agent's HTTP API; ticket 14 will replace it
/// with a generated NSwag client that satisfies the same
/// <see cref="IHyperAgentClient"/> interface.
///
/// These tests drive the client against a stub
/// <see cref="HttpMessageHandler"/> so the test runs without a real
/// Hyper Agent process. The integration smoke in ticket 18 covers
/// the full two-process boot.
/// </summary>
public sealed class HyperAgentClientTests
{
    private const string DriveKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    private static (HyperAgentClient client, RecordingHandler handler) MakeClient()
    {
        var handler = new RecordingHandler();
        var http = new HttpClient(handler)
        {
            BaseAddress = new Uri("http://hyper-agent.test"),
        };
        return (
            new HyperAgentClient(http, NullLogger<HyperAgentClient>.Instance),
            handler);
    }

    [Fact]
    public async Task FilesRangeReadAsync_HitsRangeEndpoint_AndReturns206()
    {
        var (client, handler) = MakeClient();
        var bytes = new byte[] { 1, 2, 3, 4, 5 };
        var response = new HttpResponseMessage(HttpStatusCode.PartialContent)
        {
            Content = new ByteArrayContent(bytes),
        };
        response.Content.Headers.ContentType = new MediaTypeHeaderValue("video/mp4");
        response.Content.Headers.ContentRange = new ContentRangeHeaderValue(0, 4, 5);
        handler.Map["GET /v1/files/" + DriveKey + "/trailer.mp4"] = response;

        var resp = await client.FilesRangeReadAsync(DriveKey, "/trailer.mp4", rangeStart: 0, rangeEnd: 4);

        Assert.Equal(HttpStatusCode.PartialContent, resp.StatusCode);
        Assert.Equal("video/mp4", resp.ContentType);
        Assert.Equal("bytes 0-4/5", resp.ContentRange);
        Assert.Equal(bytes, resp.Body);
        // Range header is set
        var request = handler.Requests.Single();
        Assert.NotNull(request.Headers.Range);
        Assert.NotNull(request.Headers.Range!.Ranges);
        var r = request.Headers.Range!.Ranges!.Single();
        Assert.Equal(0, r.From);
        Assert.Equal(4, r.To);
    }

    [Fact]
    public async Task FilesRangeReadAsync_OpenEnded_RangeHeaderHasNullTo()
    {
        var (client, handler) = MakeClient();
        handler.Map["GET /v1/files/" + DriveKey + "/movie.mp4"] = new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new ByteArrayContent(new byte[] { 0xAA }),
        };

        var resp = await client.FilesRangeReadAsync(DriveKey, "/movie.mp4", rangeStart: 100, rangeEnd: null);

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var request = handler.Requests.Single();
        Assert.NotNull(request.Headers.Range);
        var r = request.Headers.Range!.Ranges!.Single();
        Assert.Equal(100, r.From);
        Assert.Null(r.To);
    }

    [Fact]
    public async Task FilesRangeReadAsync_NoRange_DoesNotSetRangeHeader()
    {
        var (client, handler) = MakeClient();
        handler.Map["GET /v1/files/" + DriveKey + "/poster.jpg"] = new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new ByteArrayContent(new byte[] { 0xFF, 0xD8 }),
        };

        var resp = await client.FilesRangeReadAsync(DriveKey, "/poster.jpg");

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var request = handler.Requests.Single();
        Assert.Null(request.Headers.Range);
    }

    [Fact]
    public async Task FilesRangeReadAsync_PreservesLeadingSlash()
    {
        var (client, handler) = MakeClient();
        handler.Map["GET /v1/files/" + DriveKey + "/trailer.mp4"] = new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new ByteArrayContent(Array.Empty<byte>()),
        };

        await client.FilesRangeReadAsync(DriveKey, "trailer.mp4");

        var request = handler.Requests.Single();
        Assert.Equal($"/v1/files/{DriveKey}/trailer.mp4", request.RequestUri!.AbsolutePath);
    }

    [Fact]
    public async Task DriveReadFileAsync_HitsLegacyEndpoint()
    {
        var (client, handler) = MakeClient();
        handler.Map["GET /v1/drives/" + DriveKey + "/file?path=" + Uri.EscapeDataString("/poster.jpg")] =
            new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new ByteArrayContent(new byte[] { 1, 2, 3 }),
            };

        var bytes = await client.DriveReadFileAsync(DriveKey, "/poster.jpg");

        Assert.Equal(new byte[] { 1, 2, 3 }, bytes);
        var request = handler.Requests.Single();
        Assert.Equal($"/v1/drives/{DriveKey}/file?path={Uri.EscapeDataString("/poster.jpg")}", request.RequestUri!.AbsolutePath + request.RequestUri!.Query);
    }

    [Fact]
    public async Task GetVersionAsync_ReturnsVersion()
    {
        var (client, handler) = MakeClient();
        handler.Map["GET /v1/version"] = new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(
                JsonSerializer.Serialize(new { name = "hyper-agent", version = "1.2.3" }),
                System.Text.Encoding.UTF8, "application/json"),
        };

        var resp = await client.GetVersionAsync();

        Assert.Equal("hyper-agent", resp.Name);
        Assert.Equal("1.2.3", resp.Version);
    }

    [Fact]
    public async Task HealthAsync_ReturnsTrue_On200()
    {
        var (client, handler) = MakeClient();
        handler.Map["GET /healthz"] = new HttpResponseMessage(HttpStatusCode.OK);
        Assert.True(await client.HealthAsync());
    }

    [Fact]
    public async Task HealthAsync_ReturnsFalse_On503()
    {
        var (client, handler) = MakeClient();
        handler.Map["GET /healthz"] = new HttpResponseMessage(HttpStatusCode.ServiceUnavailable);
        Assert.False(await client.HealthAsync());
    }

    [Fact]
    public async Task FilesRangeReadAsync_SendsSharedSecret()
    {
        var (client, handler) = MakeClient();
        handler.Map["GET /v1/files/" + DriveKey + "/x"] = new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new ByteArrayContent(Array.Empty<byte>()),
        };

        // Configure the HttpClient to send the shared-secret header.
        // (The DI registration in Program.cs adds it via DefaultRequestHeaders;
        // here we add it manually because the unit test does not use DI.)
        var httpField = typeof(HyperAgentClient).GetField("_http",
            System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance);
        var http = (HttpClient)httpField!.GetValue(client)!;
        http.DefaultRequestHeaders.Add("X-Sidecar-Token", "test-token");

        await client.FilesRangeReadAsync(DriveKey, "/x");

        var request = handler.Requests.Single();
        Assert.True(request.Headers.Contains("X-Sidecar-Token"));
        Assert.Equal("test-token", string.Join(',', request.Headers.GetValues("X-Sidecar-Token")));
    }

    // ── Test infra ────────────────────────────────────────────────
}

internal static class HttpResponseMessageExtensions
{
    public static HttpResponseMessage WithHeader(this HttpResponseMessage resp, string name, string value)
    {
        resp.Headers.TryAddWithoutValidation(name, value);
        return resp;
    }
}

internal sealed class RecordingHandler : HttpMessageHandler
{
    public Dictionary<string, HttpResponseMessage> Map { get; } = new();
    public List<HttpRequestMessage> Requests { get; } = new();

    protected override async Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request,
        CancellationToken cancellationToken)
    {
        var path = request.RequestUri?.AbsolutePath ?? "";
        var query = request.RequestUri?.Query ?? "";
        var key = $"{request.Method} {path}{query}";
        Requests.Add(request);

        if (Map.TryGetValue(key, out var resp))
        {
            return await Task.FromResult(resp);
        }
        return await Task.FromResult(new HttpResponseMessage(HttpStatusCode.NotFound)
        {
            Content = new StringContent($"unmapped: {key}"),
        });
    }
}
