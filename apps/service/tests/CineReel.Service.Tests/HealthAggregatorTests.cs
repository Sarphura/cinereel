using CineReel.Service.Features.Health;
using Xunit;

namespace CineReel.Service.Tests;

public sealed class HealthAggregatorTests
{
    [Fact]
    public async Task All_required_green_returns_healthy()
    {
        var aggregator = new HealthAggregator(new IHealthProbe[]
        {
            new StubProbe("req-a", required: true, HealthCheckStatus.Healthy),
            new StubProbe("req-b", required: true, HealthCheckStatus.Healthy),
        });

        var report = await aggregator.RunAsync(CancellationToken.None);

        Assert.Equal(HealthAggregateStatus.Healthy, report.Status);
    }

    [Fact]
    public async Task Required_failure_returns_unhealthy()
    {
        var aggregator = new HealthAggregator(new IHealthProbe[]
        {
            new StubProbe("req-a", required: true, HealthCheckStatus.Healthy),
            new StubProbe("req-b", required: true, HealthCheckStatus.Unhealthy),
        });

        var report = await aggregator.RunAsync(CancellationToken.None);

        Assert.Equal(HealthAggregateStatus.Unhealthy, report.Status);
    }

    [Fact]
    public async Task Optional_failure_only_returns_degraded()
    {
        var aggregator = new HealthAggregator(new IHealthProbe[]
        {
            new StubProbe("req-a", required: true, HealthCheckStatus.Healthy),
            new StubProbe("opt-b", required: false, HealthCheckStatus.Unhealthy),
        });

        var report = await aggregator.RunAsync(CancellationToken.None);

        Assert.Equal(HealthAggregateStatus.Degraded, report.Status);
    }

    [Fact]
    public async Task Probe_throwing_is_unhealthy()
    {
        var aggregator = new HealthAggregator(new IHealthProbe[]
        {
            new ThrowingProbe("req-a", required: true),
            new StubProbe("req-b", required: true, HealthCheckStatus.Healthy),
        });

        var report = await aggregator.RunAsync(CancellationToken.None);

        Assert.Equal(HealthAggregateStatus.Unhealthy, report.Status);
        Assert.Equal(HealthCheckStatus.Unhealthy, report.Checks["req-a"].Status);
    }

    private sealed class StubProbe(string name, bool required, HealthCheckStatus status) : IHealthProbe
    {
        public string Name => name;
        public bool Required => required;
        public Task<HealthCheckResult> CheckAsync(CancellationToken ct)
            => Task.FromResult(status switch
            {
                HealthCheckStatus.Healthy => HealthCheckResult.Healthy(name, 0),
                HealthCheckStatus.Degraded => HealthCheckResult.Degraded(name, 0),
                HealthCheckStatus.Unhealthy => HealthCheckResult.Unhealthy(name, 0),
                _ => HealthCheckResult.Healthy(name, 0),
            });
    }

    private sealed class ThrowingProbe(string name, bool required) : IHealthProbe
    {
        public string Name => name;
        public bool Required => required;
        public Task<HealthCheckResult> CheckAsync(CancellationToken ct)
            => Task.FromResult(HealthCheckResult.Unhealthy(name, 0, "stub"));
    }
}
