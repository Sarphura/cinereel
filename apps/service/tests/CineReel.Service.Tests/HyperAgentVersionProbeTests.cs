using System.Net;
using System.Text.Json;
using CineReel.Service.Infrastructure.HyperAgent;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace CineReel.Service.Tests;

/// <summary>
/// Unit tests for the Hyper Agent version probe (ticket 10).
///
/// Drives the probe against a fake <see cref="HttpMessageHandler"/> so
/// the test runs without spawning the real Hyper Agent process. The
/// App Server's startup probe runs as a synchronous side-effecting step
/// between <c>WebApplication.Build()</c> and <c>app.Run()</c>; this suite
/// pins the mismatch path the operator sees when the two processes
/// drift apart.
/// </summary>
public sealed class HyperAgentVersionProbeTests
{
    private const string ExpectedVersion = "1.2.3";

    private static HyperAgentVersionProbe MakeProbe(
        StubHandler handler,
        string expected = ExpectedVersion)
    {
        var http = new HttpClient(handler)
        {
            BaseAddress = new Uri("http://hyper-agent.test"),
        };
        return new HyperAgentVersionProbe(
            http, expected, NullLogger<HyperAgentVersionProbe>.Instance);
    }

    [Fact]
    public async Task ReturnsResponseWhenVersionsMatch()
    {
        var handler = new StubHandler(_ =>
            JsonSerializer.Serialize(new { name = "hyper-agent", version = ExpectedVersion }));
        var probe = MakeProbe(handler);

        var resp = await probe.EnsureAsync();

        Assert.Equal(ExpectedVersion, resp.Version);
        Assert.Equal("hyper-agent", resp.Name);
        Assert.Single(handler.Requests);
        Assert.Equal(HttpMethod.Get, handler.Requests[0].Method);
        Assert.Equal("/v1/version", handler.Requests[0].Path);
    }

    [Fact]
    public async Task ThrowsOnMismatchWithBothVersionsInMessage()
    {
        var handler = new StubHandler(_ =>
            JsonSerializer.Serialize(new { name = "hyper-agent", version = "9.9.9" }));
        var probe = MakeProbe(handler);

        var ex = await Assert.ThrowsAsync<HyperAgentVersionMismatchException>(
            () => probe.EnsureAsync());
        Assert.Equal(ExpectedVersion, ex.ExpectedVersion);
        Assert.Equal("9.9.9", ex.ReportedVersion);
        Assert.Contains("1.2.3", ex.Message);
        Assert.Contains("9.9.9", ex.Message);
    }

    [Fact]
    public void MismatchExitCodeIs76()
    {
        Assert.Equal(76, HyperAgentVersionProbe.ExitCodeVersionMismatch);
    }

    [Fact]
    public async Task PropagatesHttpErrors()
    {
        var handler = new StubHandler(_ => null, HttpStatusCode.InternalServerError);
        var probe = MakeProbe(handler);

        await Assert.ThrowsAsync<HttpRequestException>(() => probe.EnsureAsync());
    }

    private sealed class StubHandler : HttpMessageHandler
    {
        private readonly Func<string, string?> _responder;
        private readonly HttpStatusCode _status;

        public List<(HttpMethod Method, string Path)> Requests { get; } = new();

        public StubHandler(Func<string, string?> responder, HttpStatusCode status = HttpStatusCode.OK)
        {
            _responder = responder;
            _status = status;
        }

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            var path = request.RequestUri?.AbsolutePath ?? "/";
            Requests.Add((request.Method, path));

            var body = _responder(path);
            var response = new HttpResponseMessage(_status);
            if (body != null)
            {
                response.Content = new StringContent(body, System.Text.Encoding.UTF8, "application/json");
            }
            return await Task.FromResult(response);
        }
    }
}
