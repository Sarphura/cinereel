using System.Net;

namespace CineReel.Service.Infrastructure.HyperAgent;

public interface IHyperAgentClient : IHyperAgentReadClient, IHyperAgentWriteClient
{
    Task<bool> HealthAsync(CancellationToken ct = default);
    Task<HyperAgentFileResponse> FilesRangeReadAsync(string driveKey, string path, long? rangeStart = null, long? rangeEnd = null, CancellationToken ct = default);
    Task<string> MountAsync(string publicKey, CancellationToken ct = default);
}

public sealed record HyperAgentFileResponse(
    HttpStatusCode StatusCode,
    string ContentType,
    long? ContentLength,
    string? ContentRange,
    byte[] Body);
