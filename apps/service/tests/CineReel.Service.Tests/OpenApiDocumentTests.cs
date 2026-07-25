using System.Net;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace CineReel.Service.Infrastructure.OpenApi;

/// <summary>
/// Boots the App Server's `Program` and fetches the remapped OpenAPI
/// document. Confirms the JSON document is parseable OpenAPI 3.x with at
/// least one path — i.e. the route re-mapping wired up correctly.
/// </summary>
public sealed class OpenApiDocumentTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;

    public OpenApiDocumentTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory.WithWebHostBuilder(b =>
        {
            b.UseEnvironment("Development");
        });
    }

    [Fact]
    public async Task Api_openapi_route_returns_valid_openapi3_document()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync(OpenApiSetup.OpenApiRoute);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var raw = await response.Content.ReadAsStringAsync();
        Assert.Contains("\"openapi\":", raw);
        Assert.Contains("3.0", raw);

        using var doc = System.Text.Json.JsonDocument.Parse(raw);
        var openapiVersion = doc.RootElement.GetProperty("openapi").GetString()!;
        Assert.StartsWith("3.", openapiVersion);
        Assert.True(doc.RootElement.TryGetProperty("paths", out var paths));
        Assert.True(paths.EnumerateObject().Any(), "Expected at least one path");
    }

    [Fact]
    public async Task Version_endpoint_is_listed_in_paths()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync(OpenApiSetup.OpenApiRoute);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var raw = await response.Content.ReadAsStringAsync();

        using var doc = System.Text.Json.JsonDocument.Parse(raw);
        var paths = doc.RootElement.GetProperty("paths");
        Assert.True(paths.TryGetProperty("/api/version", out _));
    }
}
