using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Cinereel.Features.Drive;
using Xunit;

namespace Cinereel.Tests.Drive;

public sealed class SubscriptionEndpointTests(CinereelWebApplicationFactory factory)
    : IClassFixture<CinereelWebApplicationFactory>
{
    private readonly HttpClient client = factory.CreateClient();

    [Fact]
    public async Task SubscribeRefreshCancelAndRestoreCompleteNormalWorkflow()
    {
        var driveKey = NewDriveKey();
        var manifest = new DriveManifest(1, "远端电影", DriveContentTypeId.MovieValue, "公开说明",
            DateTimeOffset.Parse("2025-01-01T00:00:00Z"),
            DateTimeOffset.Parse("2026-09-05T00:00:00Z"));
        factory.HyperClient.SetProtocolFile(driveKey, manifest.Serialize());

        using var created = await client.PostAsJsonAsync(
            "/api/drives/subscriptions", new CreateSubscriptionRequest(driveKey.Value));

        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var description = await created.Content.ReadFromJsonAsync<DriveDescriptionResponse>();
        Assert.NotNull(description);
        Assert.Equal(manifest.CreatedAt, description.CreatedAt);
        Assert.Equal("cached", description.SyncStatus);
        Assert.Equal($"http://localhost/api/drives/{description.DriveId}/description", created.Headers.Location?.ToString());

        using var repeated = await client.PostAsJsonAsync(
            "/api/drives/subscriptions", new CreateSubscriptionRequest(driveKey.Value));
        Assert.Equal(HttpStatusCode.OK, repeated.StatusCode);
        Assert.Equal(description, await repeated.Content.ReadFromJsonAsync<DriveDescriptionResponse>());

        manifest = manifest with { Name = "更新的电影", UpdatedAt = manifest.UpdatedAt.AddMinutes(1) };
        factory.HyperClient.SetProtocolFile(driveKey, manifest.Serialize());
        using var refreshed = await client.PostAsync(
            $"/api/drives/{description.DriveId}/subscription/refresh", null);
        Assert.Equal(HttpStatusCode.OK, refreshed.StatusCode);
        var refreshedDescription = await refreshed.Content.ReadFromJsonAsync<DriveDescriptionResponse>();
        Assert.Equal(manifest.Name, refreshedDescription!.Name);

        using var deleted = await client.DeleteAsync($"/api/drives/{description.DriveId}/subscription");
        Assert.Equal(HttpStatusCode.NoContent, deleted.StatusCode);
        using var missing = await client.GetAsync($"/api/drives/{description.DriveId}/description");
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);

        using var restored = await client.PostAsJsonAsync(
            "/api/drives/subscriptions", new CreateSubscriptionRequest(driveKey.Value));
        Assert.Equal(HttpStatusCode.Created, restored.StatusCode);
        var restoredDescription = await restored.Content.ReadFromJsonAsync<DriveDescriptionResponse>();
        Assert.Equal(description.DriveId, restoredDescription!.DriveId);
        Assert.Empty(factory.HyperClient.WriteProtocolFileCalls);
        Assert.Empty(factory.HyperClient.DeleteCalls);
    }

    [Theory]
    [InlineData("missing", "manifest_missing")]
    [InlineData("invalid", "invalid_manifest")]
    [InlineData("schema", "unsupported_schema")]
    [InlineData("contentType", "unsupported_content_type")]
    public async Task ManifestErrorsReturnIdentifiableUnprocessableProblem(string scenario, string code)
    {
        var driveKey = NewDriveKey();
        if (scenario != "missing")
        {
            var content = scenario == "invalid" ? "{"u8.ToArray() : JsonSerializer.SerializeToUtf8Bytes(new
            {
                schemaVersion = scenario == "schema" ? 2 : 1,
                name = "远端电影",
                contentTypeId = "unknown.content",
                description = "公开说明",
                createdAt = "2025-01-01T00:00:00.000Z",
                updatedAt = "2026-09-05T00:00:00.000Z"
            });
            factory.HyperClient.SetProtocolFile(driveKey, content);
        }

        using var response = await client.PostAsJsonAsync(
            "/api/drives/subscriptions", new CreateSubscriptionRequest(driveKey.Value));

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(code, problem.GetProperty("code").GetString());
    }

    [Fact]
    public async Task InvalidKeyAndUnknownSubscriptionRejectBeforeProtocolRead()
    {
        var callsBefore = factory.HyperClient.ReadProtocolFileCalls.Count;
        using var invalid = await client.PostAsJsonAsync(
            "/api/drives/subscriptions", new CreateSubscriptionRequest("invalid"));
        using var missing = await client.PostAsync($"/api/drives/{Guid.NewGuid()}/subscription/refresh", null);
        using var invalidId = await client.DeleteAsync("/api/drives/invalid/subscription");

        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, invalidId.StatusCode);
        Assert.Equal(callsBefore, factory.HyperClient.ReadProtocolFileCalls.Count);
    }

    [Theory]
    [InlineData("/swagger/v1/swagger.json")]
    [InlineData("/openapi/v1.json")]
    public async Task OpenApiIncludesSubscriptionOperationsAndProtocolFailures(string path)
    {
        var document = await client.GetFromJsonAsync<JsonElement>(path);
        var paths = document.GetProperty("paths");
        var create = paths.GetProperty("/api/drives/subscriptions").GetProperty("post");
        var refresh = paths.GetProperty("/api/drives/{driveId}/subscription/refresh").GetProperty("post");
        var delete = paths.GetProperty("/api/drives/{driveId}/subscription").GetProperty("delete");

        Assert.True(create.GetProperty("responses").TryGetProperty("201", out _));
        Assert.True(delete.GetProperty("responses").TryGetProperty("204", out _));
        foreach (var operation in new[] { create, refresh })
        {
            var responses = operation.GetProperty("responses");
            Assert.True(responses.TryGetProperty("422", out _));
            Assert.True(responses.TryGetProperty("503", out _));
            Assert.True(responses.TryGetProperty("504", out _));
        }
    }

    private static DriveKey NewDriveKey()
    {
        Assert.True(DriveKey.TryCreate(Guid.NewGuid().ToString("N") + Guid.NewGuid().ToString("N"), out var key));
        return key;
    }
}
