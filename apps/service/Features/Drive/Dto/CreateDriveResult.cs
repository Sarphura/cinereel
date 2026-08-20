namespace Cinereel.Features.Drive;

public sealed record CreateDriveResult(
    CreateDriveResultCode ResultCode,
    DriveResponse? Drive);
