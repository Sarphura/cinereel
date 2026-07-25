using System.Net;
using CineReel.Service.Infrastructure.HyperAgent;
using Xunit;

namespace CineReel.Service.Tests;

public sealed class ResilientHyperAgentReadClientTests
{
    [Fact]
    public async Task Transient_read_failure_is_retried_until_success()
    {
        var inner = new FlakyReadClient(2, new HttpRequestException("unavailable", null, HttpStatusCode.ServiceUnavailable));
        var client = new ResilientHyperAgentReadClient(inner, PollyPipelineFactory.Create());

        var health = await client.GetHealthAsync();

        Assert.Equal("ok", health.Status);
        Assert.Equal(3, inner.Attempts);
    }

    [Fact]
    public async Task Client_error_is_not_retried()
    {
        var inner = new FlakyReadClient(1, new HttpRequestException("bad request", null, HttpStatusCode.BadRequest));
        var client = new ResilientHyperAgentReadClient(inner, PollyPipelineFactory.Create());

        await Assert.ThrowsAsync<HttpRequestException>(() => client.GetHealthAsync());

        Assert.Equal(1, inner.Attempts);
    }

    private sealed class FlakyReadClient(int failures, Exception failure) : IHyperAgentReadClient
    {
        public int Attempts { get; private set; }
        public Task<HealthResponse> GetHealthAsync(CancellationToken cancellationToken = default)
        {
            Attempts++;
            return Attempts <= failures
                ? Task.FromException<HealthResponse>(failure)
                : Task.FromResult(new HealthResponse("ok", 1));
        }
        public Task<HyperAgentVersionResponse> GetVersionAsync(CancellationToken cancellationToken = default) => throw new NotSupportedException();
    }
}
