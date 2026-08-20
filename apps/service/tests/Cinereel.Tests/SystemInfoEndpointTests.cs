using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace Cinereel.Tests;

public sealed class SystemInfoEndpointTests : IClassFixture<CinereelWebApplicationFactory>
{
    private readonly HttpClient _client;

    public SystemInfoEndpointTests(CinereelWebApplicationFactory factory)
    {
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task GetSystemInfoReturnsCurrentInstanceIdentity()
    {
        var response = await _client.GetAsync("/api/system-info");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = await response.Content.ReadFromJsonAsync<SystemInfoResponse>();
        Assert.NotNull(body);
        Assert.Equal("Cinereel", body.Product);
        Assert.False(string.IsNullOrWhiteSpace(body.Version));
        Assert.False(string.IsNullOrWhiteSpace(body.Runtime));
    }

    [Fact]
    public async Task SwaggerUiAndDocumentAreAvailableInDevelopment()
    {
        var uiResponse = await _client.GetAsync("/swagger/index.html");
        var documentResponse = await _client.GetAsync("/swagger/v1/swagger.json");

        Assert.Equal(HttpStatusCode.OK, uiResponse.StatusCode);
        Assert.Equal("text/html", uiResponse.Content.Headers.ContentType?.MediaType);
        Assert.Contains(
            "<div id=\"swagger-ui\"></div>",
            await uiResponse.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.OK, documentResponse.StatusCode);
        Assert.Contains(
            "\"/api/drives\"",
            await documentResponse.Content.ReadAsStringAsync());
    }

    private sealed record SystemInfoResponse(
        string Product,
        string Version,
        string Runtime);
}
