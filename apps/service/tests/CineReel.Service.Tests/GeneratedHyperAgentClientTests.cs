using System.Net;
using System.Text.Json;
using CineReel.Service.Infrastructure.HyperAgent.Generated;
using Xunit;

namespace CineReel.Service.Tests;

/// <summary>
/// Smoke tests for the NSwag-generated <see cref="HyperAgentClient"/>.
/// The wire-format compatibility is the contract-freeze asserted by
/// the drift check; these tests confirm the generated code
/// round-trips a few representative routes against a stub
/// <see cref="HttpMessageHandler"/>.
/// </summary>
public class GeneratedHyperAgentClientTests
{
    private const string Token = "the-shared-secret";

    private static HyperAgentClient MakeClient(out RecordingHandler handler)
    {
        handler = new RecordingHandler();
        var http = new HttpClient(handler)
        {
            BaseAddress = new Uri("http://hyper-agent.local"),
        };
        return new HyperAgentClient(http, Token);
    }

    [Fact]
    public async Task GetVersion_ReturnsNameAndVersion()
    {
        var client = MakeClient(out var handler);
        handler.Map["GET /v1/version"] = new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(
                JsonSerializer.Serialize(new { name = "hyper-agent", version = "1.2.3" }),
                System.Text.Encoding.UTF8, "application/json"),
        };

        // The snapshot's version response has no schema, so the
        // generated method returns `object`. The serializer round-trips
        // it as a JsonElement; the wire shape is what we care about.
        var v = await client.GetVersion();
        var json = JsonSerializer.Serialize(v);
        Assert.Contains("\"hyper-agent\"", json);
        Assert.Contains("\"1.2.3\"", json);
    }

    [Fact]
    public async Task MissingToken_ThrowsTypedException()
    {
        var client = MakeClient(out var handler);
        handler.Map["GET /v1/version"] = new HttpResponseMessage(HttpStatusCode.Unauthorized)
        {
            Content = new StringContent(
                JsonSerializer.Serialize(new
                {
                    type = "https://cinereel.dev/errors/missing-token",
                    title = "missing token",
                    status = 401,
                }),
                System.Text.Encoding.UTF8, "application/problem+json"),
        };

        await Assert.ThrowsAsync<HyperAgentMissingTokenException>(() => client.GetVersion());
    }

    [Fact]
    public async Task DriveNotMounted_ThrowsTypedException()
    {
        var client = MakeClient(out var handler);
        var key = new string('a', 64);
        // The generated OpenAPI path is `/v1/files/{driveKey}/{path}` —
        // the snapshot's path is `/trailer.mp4` (no leading slash on the
        // generated call), so the resolved URL matches the handler map.
        handler.Map["GET /v1/files/" + key + "/trailer.mp4"] =
            new HttpResponseMessage(HttpStatusCode.NotFound)
            {
                Content = new StringContent(
                    JsonSerializer.Serialize(new
                    {
                        type = "https://cinereel.dev/errors/drive-not-mounted",
                        title = "drive not mounted",
                        status = 404,
                    }),
                    System.Text.Encoding.UTF8, "application/problem+json"),
            };

        var ex = await Assert.ThrowsAsync<HyperAgentDriveNotMountedException>(
            () => client.ReadFileRange(key, "trailer.mp4"));
        Assert.Equal(404, ex.StatusCode);
    }

    [Fact]
    public async Task ReadFileRange_BuildsExpectedPath()
    {
        var client = MakeClient(out var handler);
        handler.Map["GET /v1/files/" + new string('a', 64) + "/trailer.mp4"] =
            new HttpResponseMessage(HttpStatusCode.OK);

        try
        {
            await client.ReadFileRange(new string('a', 64), "trailer.mp4");
        }
        catch
        {
            // ignore — we just want to inspect the request shape
        }

        var actual = handler.Requests.Single().RequestUri!.AbsolutePath;
        var expected = "/v1/files/" + new string('a', 64) + "/trailer.mp4";
        Assert.Equal(expected, actual);
    }

    [Fact]
    public async Task RequestCarriesBearerToken()
    {
        var client = MakeClient(out var handler);
        handler.Map["GET /v1/version"] = new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(
                "{\"name\":\"hyper-agent\",\"version\":\"0.0.2\"}",
                System.Text.Encoding.UTF8, "application/json"),
        };

        await client.GetVersion();

        var req = handler.Requests.Single();
        Assert.Equal("Bearer", req.Headers.Authorization?.Scheme);
        Assert.Equal(Token, req.Headers.Authorization?.Parameter);
    }

    private sealed class RecordingHandler : HttpMessageHandler
    {
        public Dictionary<string, HttpResponseMessage> Map { get; } = new();
        public List<HttpRequestMessage> Requests { get; } = new();

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Requests.Add(request);
            var key = request.Method + " " + request.RequestUri!.AbsolutePath;
            if (request.RequestUri!.Query.Length > 0)
            {
                key += request.RequestUri!.Query;
            }
            if (Map.TryGetValue(key, out var resp))
            {
                return Task.FromResult(resp);
            }
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.NotFound)
            {
                Content = new StringContent("no stub for " + key),
            });
        }
    }
}
