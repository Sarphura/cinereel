namespace Cinereel.Features.Drive;

public sealed record ListDriveDirectoryResult(
    ListDriveDirectoryResultCode ResultCode,
    DriveDirectoryResponse? Directory);
