using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace Cinereel.Tests;

public sealed class SystemInfoEndpointTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly HttpClient _client;

    public SystemInfoEndpointTests(WebApplicationFactory<Program> factory)
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

    private sealed record SystemInfoResponse(
        string Product,
        string Version,
        string Runtime);
}
