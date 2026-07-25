using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace CineReel.Service.Tests;

/// <summary>
/// Smoke tests for the minimal skeleton. Verifies the three end-to-end
/// surfaces a Sidecar / web UI client must hit on first startup:
///
///   - GET /health          (ADR 0040, required check)
///   - GET /api/version     (ADR 0033, Sidecar version hand-off)
///   - GET /openapi/v1.json (ADR 0034, NSwag / openapi-typescript codegen)
///
/// Per ADR 0021 the test pyramid is mostly unit; these are integration
/// tests against a `WebApplicationFactory` host. They live at the same
/// tier as the seam — the HTTP API — so any future endpoint that lands
/// in `apps/service` should grow a parallel test here.
/// </summary>
public sealed class SkeletonEndpointsTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;

    public SkeletonEndpointsTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Health_Required_ReturnsHealthy()
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync("/health");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Equal("Healthy", body);
    }

    [Fact]
    public async Task Version_ReturnsKnownShape()
    {
        var client = _factory.CreateClient();

        var version = await client.GetFromJsonAsync<VersionPayload>("/api/version");

        Assert.NotNull(version);
        Assert.Equal("cinereel-app-server", version!.Service);
        Assert.Equal("v1", version.ApiVersion);
        Assert.False(string.IsNullOrWhiteSpace(version.Version));
        Assert.False(string.IsNullOrWhiteSpace(version.Runtime));
    }

    [Fact]
    public async Task OpenApi_Document_IsValidAndListsApiVersion()
    {
        var client = _factory.CreateClient();

        var openapi = await client.GetFromJsonAsync<OpenApiPayload>("/openapi/v1.json");

        Assert.NotNull(openapi);
        Assert.StartsWith("3.", openapi!.Openapi);
        Assert.Contains("/api/version", openapi.Paths!.Keys);
    }

    private sealed record VersionPayload(
        string Service,
        string Version,
        string ApiVersion,
        string Runtime,
        DateTimeOffset BuiltAt,
        string Commit);

    private sealed record OpenApiPayload(string Openapi, Dictionary<string, object>? Paths);
}
