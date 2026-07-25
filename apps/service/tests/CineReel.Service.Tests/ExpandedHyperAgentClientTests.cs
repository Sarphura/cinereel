using System.Net;
using System.Text;
using CineReel.Service.Infrastructure.HyperAgent;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace CineReel.Service.Tests;

public sealed class ExpandedHyperAgentClientTests
{
    private const string Key = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    [Fact]
    public async Task CreateDrive_posts_name_and_type()
    {
        var handler = new RecordingHandler();
        handler.Map["POST /v1/drives"] = Json("""{"driveKey":"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef","name":"Demo","type":"metadata","isLocal":true}""");
        var client = CreateClient(handler);

        var response = await client.CreateDriveAsync("Demo", "metadata");

        Assert.Equal(Key, response.DriveKey);
        Assert.Equal("/v1/drives", handler.Requests.Single().RequestUri!.AbsolutePath);
    }

    [Fact]
    public async Task GetTree_forwards_prefix_and_wait_query()
    {
        var handler = new RecordingHandler();
        handler.Map[$"GET /v1/drives/{Key}/tree?prefix=%2Fmovies&wait=true"] = Json("""{"name":"movies","type":"directory","children":[]}""");
        var client = CreateClient(handler);

        var response = await client.GetTreeAsync(Key, "/movies");

        Assert.Equal("movies", response.Name);
    }

    [Fact]
    public async Task WriteFile_sends_binary_body_and_metadata()
    {
        var handler = new RecordingHandler();
        handler.Map[$"PUT /v1/drives/{Key}/file?path=%2Fdescriptor.json"] = Json("""{"ok":true,"byteLength":2}""");
        var client = CreateClient(handler);

        var response = await client.WriteFileAsync(Key, "/descriptor.json", [1, 2], new { kind = "descriptor" });

        Assert.True(response.Ok);
        var request = handler.Requests.Single();
        Assert.Equal("application/octet-stream", request.Content!.Headers.ContentType!.MediaType);
        Assert.True(request.Headers.Contains("X-Metadata"));
    }

    private static HyperAgentClient CreateClient(HttpMessageHandler handler) =>
        new(new HttpClient(handler) { BaseAddress = new Uri("http://hyper-agent.test") }, NullLogger<HyperAgentClient>.Instance);

    private static HttpResponseMessage Json(string body) => new(HttpStatusCode.OK)
    {
        Content = new StringContent(body, Encoding.UTF8, "application/json"),
    };
}
