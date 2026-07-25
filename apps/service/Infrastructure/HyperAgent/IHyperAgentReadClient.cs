namespace CineReel.Service.Infrastructure.HyperAgent;

public interface IHyperAgentReadClient
{
    Task<HealthResponse> GetHealthAsync(CancellationToken cancellationToken = default) =>
        Task.FromException<HealthResponse>(new NotSupportedException());
    Task<HyperAgentVersionResponse> GetVersionAsync(CancellationToken cancellationToken = default);
    Task<IReadOnlyList<DriveDescriptor>> ListDrivesAsync(CancellationToken cancellationToken = default) =>
        Task.FromException<IReadOnlyList<DriveDescriptor>>(new NotSupportedException());
    Task<HyperdriveEntry?> GetEntryAsync(string driveKey, string path, bool wait = true, CancellationToken cancellationToken = default) =>
        Task.FromException<HyperdriveEntry?>(new NotSupportedException());
    Task<TreeNode> GetTreeAsync(string driveKey, string prefix = "/", bool wait = true, CancellationToken cancellationToken = default) =>
        Task.FromException<TreeNode>(new NotSupportedException());
    Task<HyperAgentFileResponse> ReadFileAsync(string driveKey, string path, long? rangeStart = null, long? rangeEnd = null, CancellationToken cancellationToken = default) =>
        Task.FromException<HyperAgentFileResponse>(new NotSupportedException());
    Task<IReadOnlyList<PeerInfo>> GetPeersAsync(CancellationToken cancellationToken = default) =>
        Task.FromException<IReadOnlyList<PeerInfo>>(new NotSupportedException());
    Task<IdentityInfo> GetIdentityAsync(CancellationToken cancellationToken = default) =>
        Task.FromException<IdentityInfo>(new NotSupportedException());
}
