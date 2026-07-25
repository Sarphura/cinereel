namespace CineReel.Service.Infrastructure.HyperAgent;

public interface IHyperAgentWriteClient
{
    Task<CreateDriveResponse> CreateDriveAsync(string name, string type, CancellationToken cancellationToken = default) =>
        Task.FromException<CreateDriveResponse>(new NotSupportedException());
    Task<FileWriteResponse> WriteFileAsync(string driveKey, string path, byte[] body, object? metadata = null, CancellationToken cancellationToken = default) =>
        Task.FromException<FileWriteResponse>(new NotSupportedException());
    Task<DeleteResponse> DeleteFileAsync(string driveKey, string path, bool recursive = false, CancellationToken cancellationToken = default) =>
        Task.FromException<DeleteResponse>(new NotSupportedException());
    Task<MountResponse> MountRemoteDriveAsync(string publicKey, CancellationToken cancellationToken = default) =>
        Task.FromException<MountResponse>(new NotSupportedException());
    Task<UnmountResponse> UnmountRemoteDriveAsync(string publicKey, CancellationToken cancellationToken = default) =>
        Task.FromException<UnmountResponse>(new NotSupportedException());
    Task<AnnounceResponse> AnnounceAsync(bool wait = true, CancellationToken cancellationToken = default) =>
        Task.FromException<AnnounceResponse>(new NotSupportedException());
}
