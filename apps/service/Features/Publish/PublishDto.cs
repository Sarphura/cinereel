namespace CineReel.Service.Features.Publish;

public sealed record CreateDriveRequest(string Name, string Type);
public sealed record CreateDriveResponseDto(string DriveKey, string Name, string Type, DateTimeOffset CreatedAt);
public sealed record AnnounceRequest(bool Wait);
public sealed record PeerInfoResponseDto(string PublicKey, DateTimeOffset ConnectedAt, string? RemoteAddress);
public sealed record IdentityResponseDto(string MainDriveKey, string PeerPublicKey, int SwarmPort, int PeerCount);

public sealed class PublishValidationException : Exception
{
    public string Code { get; }
    public PublishValidationException(string code, string message) : base(message) { Code = code; }
}

public sealed class PublishConflictException : Exception
{
    public string Code { get; }
    public PublishConflictException(string code, string message) : base(message) { Code = code; }
}