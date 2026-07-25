using Polly;

namespace CineReel.Service.Infrastructure.HyperAgent;

public sealed class ResilientHyperAgentReadClient(
    IHyperAgentReadClient inner,
    ResiliencePipeline pipeline) : IHyperAgentReadClient
{
    public Task<HealthResponse> GetHealthAsync(CancellationToken cancellationToken = default) =>
        ExecuteAsync(token => inner.GetHealthAsync(token), cancellationToken);
    public Task<HyperAgentVersionResponse> GetVersionAsync(CancellationToken cancellationToken = default) =>
        ExecuteAsync(token => inner.GetVersionAsync(token), cancellationToken);
    public Task<IReadOnlyList<DriveDescriptor>> ListDrivesAsync(CancellationToken cancellationToken = default) =>
        ExecuteAsync(token => inner.ListDrivesAsync(token), cancellationToken);
    public Task<HyperdriveEntry?> GetEntryAsync(string driveKey, string path, bool wait = true, CancellationToken cancellationToken = default) =>
        ExecuteAsync(token => inner.GetEntryAsync(driveKey, path, wait, token), cancellationToken);
    public Task<TreeNode> GetTreeAsync(string driveKey, string prefix = "/", bool wait = true, CancellationToken cancellationToken = default) =>
        ExecuteAsync(token => inner.GetTreeAsync(driveKey, prefix, wait, token), cancellationToken);
    public Task<HyperAgentFileResponse> ReadFileAsync(string driveKey, string path, long? rangeStart = null, long? rangeEnd = null, CancellationToken cancellationToken = default) =>
        ExecuteAsync(token => inner.ReadFileAsync(driveKey, path, rangeStart, rangeEnd, token), cancellationToken);
    public Task<IReadOnlyList<PeerInfo>> GetPeersAsync(CancellationToken cancellationToken = default) =>
        ExecuteAsync(token => inner.GetPeersAsync(token), cancellationToken);
    public Task<IdentityInfo> GetIdentityAsync(CancellationToken cancellationToken = default) =>
        ExecuteAsync(token => inner.GetIdentityAsync(token), cancellationToken);

    private async Task<T> ExecuteAsync<T>(Func<CancellationToken, Task<T>> action, CancellationToken cancellationToken) =>
        await pipeline.ExecuteAsync(async token => await action(token), cancellationToken);
}
