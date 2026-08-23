using System.Net;
using System.Net.Http.Json;
using Cinereel.Features.Drive;
using Xunit;

namespace Cinereel.Tests.Drive;

public sealed class DriveEndpointTests : IClassFixture<CinereelWebApplicationFactory>
{
    private readonly HttpClient _client;

    public DriveEndpointTests(CinereelWebApplicationFactory factory)
    {
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task CreateGetAndListDrive()
    {
        var idempotencyKey = $"test:{Guid.NewGuid():N}";
        var createResponse = await CreateAsync(idempotencyKey, "  电影资料  ");

        Assert.Equal(HttpStatusCode.Accepted, createResponse.StatusCode);
        var created = await createResponse.Content.ReadFromJsonAsync<DriveBody>();
        Assert.NotNull(created);
        Assert.Equal("电影资料", created.Name);
        Assert.Equal(DriveContentTypeId.MovieValue, created.ContentTypeId);
        Assert.Equal("ownership", created.Relation);
        Assert.Equal("pending", created.Status);
        Assert.Null(created.DriveKey);
        Assert.Equal(
            $"/api/drives/{created.DriveId:D}",
            createResponse.Headers.Location?.AbsolutePath);

        var getResponse = await _client.GetAsync($"/api/drives/{created.DriveId:D}");
        Assert.Equal(HttpStatusCode.OK, getResponse.StatusCode);
        var found = await getResponse.Content.ReadFromJsonAsync<DriveBody>();
        Assert.NotNull(found);
        Assert.Equal(created.DriveId, found.DriveId);

        var listed = await _client.GetFromJsonAsync<DriveBody[]>("/api/drives");
        Assert.Contains(
            Assert.IsType<DriveBody[]>(listed),
            drive => drive.DriveId == created.DriveId);
    }

    [Fact]
    public async Task RepeatedCreateReturnsSameDrive()
    {
        var idempotencyKey = $"test:{Guid.NewGuid():N}";
        var firstResponse = await CreateAsync(idempotencyKey, "电影资料");
        var first = await firstResponse.Content.ReadFromJsonAsync<DriveBody>();

        var repeatedResponse = await CreateAsync(idempotencyKey, "电影资料");
        var repeated = await repeatedResponse.Content.ReadFromJsonAsync<DriveBody>();

        Assert.Contains(
            repeatedResponse.StatusCode,
            new[] { HttpStatusCode.Accepted, HttpStatusCode.OK });
        Assert.Equal(first!.DriveId, repeated!.DriveId);
    }

    [Fact]
    public async Task ReusingIdempotencyKeyForDifferentRequestReturnsConflict()
    {
        var idempotencyKey = $"test:{Guid.NewGuid():N}";
        await CreateAsync(idempotencyKey, "电影资料");

        var response = await CreateAsync(idempotencyKey, "剧集资料");

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal(
            "application/problem+json",
            response.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task CreateRequiresValidIdempotencyKey()
    {
        var response = await _client.PostAsJsonAsync(
            "/api/drives",
            new { name = "电影资料", contentTypeId = DriveContentTypeId.MovieValue });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(
            "application/problem+json",
            response.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task GetRejectsInvalidDriveId()
    {
        var response = await _client.GetAsync("/api/drives/not-a-guid");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(
            "application/problem+json",
            response.Content.Headers.ContentType?.MediaType);
    }

    private async Task<HttpResponseMessage> CreateAsync(string idempotencyKey, string name)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/drives")
        {
            Content = JsonContent.Create(new
            {
                name,
                contentTypeId = DriveContentTypeId.MovieValue
            })
        };
        request.Headers.Add("Idempotency-Key", idempotencyKey);
        return await _client.SendAsync(request);
    }

    private sealed record DriveBody(
        Guid DriveId,
        string? DriveKey,
        string Name,
        string ContentTypeId,
        string? Remark,
        string Relation,
        string Status,
        DateTimeOffset CreatedAt,
        DateTimeOffset UpdatedAt);
}
