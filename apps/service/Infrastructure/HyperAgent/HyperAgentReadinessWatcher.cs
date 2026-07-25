using CineReel.Service.Features.Subscription;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace CineReel.Service.Infrastructure.HyperAgent;

/// <summary>
/// Background <see cref="IHostedService"/> that polls the Hyper
/// Agent's <c>/healthz</c> + <c>/v1/version</c> endpoints and raises
/// a <see cref="HyperAgentRecoveredEvent"/> once both signal ready.
///
/// The polling is single-shot on startup so the connect attempt
/// happens once and the recovery service runs exactly once. A
/// supervisor outside this class can re-publish the event if the
/// Hyper Agent is restarted mid-session.
/// </summary>
public sealed class HyperAgentReadinessWatcher : IHostedService
{
    private readonly IHyperAgentClient _client;
    private readonly string _expectedVersion;
    private readonly SubscriptionRecoveryService _recovery;
    private readonly ILogger<HyperAgentReadinessWatcher> _logger;

    public HyperAgentReadinessWatcher(
        IHyperAgentClient client,
        string expectedVersion,
        SubscriptionRecoveryService recovery,
        ILogger<HyperAgentReadinessWatcher> logger)
    {
        _client = client ?? throw new ArgumentNullException(nameof(client));
        _expectedVersion = expectedVersion ?? throw new ArgumentNullException(nameof(expectedVersion));
        _recovery = recovery ?? throw new ArgumentNullException(nameof(recovery));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    public async Task StartAsync(CancellationToken ct)
    {
        if (!await _client.HealthAsync(ct))
        {
            _logger.LogWarning("[ready] Hyper Agent not yet healthy; skipping recovery");
            return;
        }
        var version = await _client.GetVersionAsync(ct);
        if (!string.Equals(version.Version, _expectedVersion, StringComparison.Ordinal))
        {
            _logger.LogWarning(
                "[ready] version mismatch ({Reported} vs {Expected}); skipping recovery",
                version.Version,
                _expectedVersion);
            return;
        }
        var evt = new CineReel.Service.Features.Subscription.HyperAgentRecovered(DateTime.UtcNow, version.Version);
        await _recovery.RecoverAsync(evt, ct);
    }

    public Task StopAsync(CancellationToken ct) => Task.CompletedTask;
}
