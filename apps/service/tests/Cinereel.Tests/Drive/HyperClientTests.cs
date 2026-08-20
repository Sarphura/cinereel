using System.Net;
using System.Text;
using System.Text.Json;
using Cinereel.Features.Drive;
using Xunit;

namespace Cinereel.Tests.Drive;

public sealed class HyperClientTests
{
    [Fact]
    public async Task CreateUsesDriveIdAsNamespaceAndBlobStorage()
    {
        var driveId = DriveId.New();
        Assert.True(DriveName.TryCreate("电影资料", out var name));
        var handler = new RecordingHandler(request => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(
                $$"""{"driveKey":"{{new string('A', 64)}}"}""",
                Encoding.UTF8,
                "application/json")
        });
        var client = CreateClient(handler);

        var driveKey = await client.CreateAsync(driveId, name, CancellationToken.None);

        var request = Assert.Single(handler.Requests);
        Assert.Equal(HttpMethod.Post, request.Method);
        Assert.Equal("http://hyper-client/v1/drives", request.RequestUri?.ToString());
        using var document = JsonDocument.Parse(Assert.IsType<string>(request.Body));
        Assert.Equal(driveId.ToString(), document.RootElement.GetProperty("namespace").GetString());
        Assert.Equal(name.Value, document.RootElement.GetProperty("name").GetString());
        Assert.Equal("blob", document.RootElement.GetProperty("type").GetString());
        Assert.Equal(new string('a', 64), driveKey.Value);
    }

    [Fact]
    public async Task DeleteUsesDriveKeyInRoute()
    {
        Assert.True(DriveKey.TryCreate(new string('b', 64), out var driveKey));
        var handler = new RecordingHandler(_ => new HttpResponseMessage(HttpStatusCode.OK));
        var client = CreateClient(handler);

        await client.DeleteAsync(driveKey, CancellationToken.None);

        var request = Assert.Single(handler.Requests);
        Assert.Equal(HttpMethod.Delete, request.Method);
        Assert.Equal(
            $"http://hyper-client/v1/drives/{driveKey.Value}",
            request.RequestUri?.ToString());
    }

    [Fact]
    public async Task CreateRejectsInvalidDriveKeyFromHyperClient()
    {
        var handler = new RecordingHandler(_ => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(
                """{"driveKey":"invalid"}""",
                Encoding.UTF8,
                "application/json")
        });
        var client = CreateClient(handler);
        Assert.True(DriveName.TryCreate("Drive", out var name));

        await Assert.ThrowsAsync<HyperClientException>(() =>
            client.CreateAsync(DriveId.New(), name, CancellationToken.None));
    }

    private static HyperClient CreateClient(HttpMessageHandler handler)
    {
        var httpClient = new HttpClient(handler)
        {
            BaseAddress = new Uri("http://hyper-client/")
        };

        return new HyperClient(httpClient);
    }

    private sealed class RecordingHandler(
        Func<HttpRequestMessage, HttpResponseMessage> respond) : HttpMessageHandler
    {
        internal List<RecordedRequest> Requests { get; } = [];

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            var body = request.Content is null
                ? null
                : await request.Content.ReadAsStringAsync(cancellationToken);
            Requests.Add(new RecordedRequest(request.Method, request.RequestUri, body));
            return respond(request);
        }
    }

    private sealed record RecordedRequest(
        HttpMethod Method,
        Uri? RequestUri,
        string? Body);
}
