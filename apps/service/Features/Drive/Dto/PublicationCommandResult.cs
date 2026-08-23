namespace Cinereel.Features.Drive;

public sealed record PublicationCommandResult(
    PublicationCommandResultCode ResultCode,
    Publication? Publication);
