using System.Text.Json;
using System.Text.Json.Serialization;

namespace CineReel.Service.Infrastructure.HyperAgent;

public sealed record HealthResponse(string Status, double Uptime);
public sealed record DriveDescriptor(string DriveKey, string Name, string Type, bool IsLocal, DateTimeOffset? CreatedAt);
public sealed record HyperdriveEntry(string Key, long Seq, HyperdriveEntryValue? Value);
public sealed record HyperdriveEntryValue(string Type, JsonElement Metadata);
public sealed record TreeNode(string Name, string Type, long? Size, IReadOnlyList<TreeNode>? Children);
public sealed record PeerInfo(string PublicKey, DateTimeOffset ConnectedAt, string? RemoteAddress = null);
public sealed record IdentityInfo(string MainDriveKey, string PeerPublicKey, int SwarmPort, int PeerCount);
public sealed record MountResponse(string DriveKey);
public sealed record UnmountResponse(bool Ok);
public sealed record AnnounceResponse(bool Ok);
public sealed record CreateDriveResponse(string DriveKey, string Name, string Type, bool IsLocal, DateTimeOffset? CreatedAt);
public sealed record FileWriteResponse(bool Ok, long ByteLength);
public sealed record DeleteResponse(bool Ok);

internal static class HyperAgentJson
{
    internal static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web)
    {
        PropertyNameCaseInsensitive = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };
}
