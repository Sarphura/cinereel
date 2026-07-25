using CineReel.Service.Infrastructure.HyperAgent.Generated;

namespace CineReel.Service.Infrastructure.HyperAgent;

/// <summary>
/// Fallback no-op reader used when the App Server is configured without
/// a Hyper Agent (e.g. integration tests, smoke-only hosts). All
/// calls surface as either the documented not-mounted error or an
/// empty result so the dependent feature services can be constructed
/// without a real sidecar. Mirrors the original
/// `IHyperAgentClient` union methods so feature services that consumed
/// the union still compile.
/// </summary>
public sealed class NullHyperAgentReadClient : IHyperAgentReadClient
{
    public Task<HealthResponse> GetHealthAsync(CancellationToken cancellationToken = default) =>
        throw new HyperAgentDriveNotMountedException(new Uri("about:blank"), 503, "no Hyper Agent registered");
    public Task<HyperAgentVersionResponse> GetVersionAsync(CancellationToken cancellationToken = default) =>
        Task.FromResult(new HyperAgentVersionResponse("null", "0.0.0"));
    public Task<IReadOnlyList<DriveDescriptor>> ListDrivesAsync(CancellationToken cancellationToken = default) =>
        Task.FromResult<IReadOnlyList<DriveDescriptor>>([]);
    public Task<HyperdriveEntry?> GetEntryAsync(string driveKey, string path, bool wait = true, CancellationToken cancellationToken = default) =>
        Task.FromResult<HyperdriveEntry?>(null);
    public Task<TreeNode> GetTreeAsync(string driveKey, string prefix = "/", bool wait = true, CancellationToken cancellationToken = default) =>
        throw new HyperAgentDriveNotMountedException(new Uri("about:blank"), 503, "no Hyper Agent registered");
    public Task<HyperAgentFileResponse> ReadFileAsync(string driveKey, string path, long? rangeStart = null, long? rangeEnd = null, CancellationToken cancellationToken = default) =>
        throw new HyperAgentDriveNotMountedException(new Uri("about:blank"), 503, "no Hyper Agent registered");
    public Task<IReadOnlyList<PeerInfo>> GetPeersAsync(CancellationToken cancellationToken = default) =>
        Task.FromResult<IReadOnlyList<PeerInfo>>([]);
    public Task<IdentityInfo> GetIdentityAsync(CancellationToken cancellationToken = default) =>
        Task.FromResult(new IdentityInfo("0000000000000000000000000000000000000000000000000000000000000000", "null", 0, 0));
}

/// <summary>
/// Fallback no-op writer used when the App Server is configured without
/// a Hyper Agent. All write calls surface as a not-mounted exception so
/// callers fail loudly instead of silently corrupting state.
/// </summary>
public sealed class NullHyperAgentWriteClient : IHyperAgentWriteClient
{
    public Task<CreateDriveResponse> CreateDriveAsync(string name, string type, CancellationToken cancellationToken = default) =>
        throw new HyperAgentDriveNotMountedException(new Uri("about:blank"), 503, "no Hyper Agent registered");
    public Task<FileWriteResponse> WriteFileAsync(string driveKey, string path, byte[] body, object? metadata = null, CancellationToken cancellationToken = default) =>
        throw new HyperAgentDriveNotMountedException(new Uri("about:blank"), 503, "no Hyper Agent registered");
    public Task<DeleteResponse> DeleteFileAsync(string driveKey, string path, bool recursive = false, CancellationToken cancellationToken = default) =>
        throw new HyperAgentDriveNotMountedException(new Uri("about:blank"), 503, "no Hyper Agent registered");
    public Task<MountResponse> MountRemoteDriveAsync(string publicKey, CancellationToken cancellationToken = default) =>
        throw new HyperAgentDriveNotMountedException(new Uri("about:blank"), 503, "no Hyper Agent registered");
    public Task<UnmountResponse> UnmountRemoteDriveAsync(string publicKey, CancellationToken cancellationToken = default) =>
        throw new HyperAgentDriveNotMountedException(new Uri("about:blank"), 503, "no Hyper Agent registered");
    public Task<AnnounceResponse> AnnounceAsync(bool wait = true, CancellationToken cancellationToken = default) =>
        throw new HyperAgentDriveNotMountedException(new Uri("about:blank"), 503, "no Hyper Agent registered");
}