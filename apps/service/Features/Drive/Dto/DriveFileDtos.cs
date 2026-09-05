namespace Cinereel.Features.Drive;

public sealed record ListDriveDirectoryResult(
    ListDriveDirectoryResultCode ResultCode,
    DriveDirectoryResponse? Directory);

public enum ListDriveDirectoryResultCode
{
    Listed,
    DriveNotFound,
    DriveNotReady,
    VersionConflict,
    ContentUnavailable
}

public sealed record DriveDirectoryResponse(
    string Path,
    long DriveVersion,
    IReadOnlyList<DriveDirectoryEntryResponse> Entries,
    string? NextCursor);

public sealed record DriveDirectoryEntryResponse(
    string Path,
    string Name,
    string Type,
    long? Size);

public enum AddDriveFileResultCode
{
    Created,
    DriveNotFound,
    DriveNotReady,
    WriteNotAllowed,
    AlreadyExists,
    FileTooLarge,
    ContentUnavailable
}

public enum DeleteDriveFileResultCode
{
    Deleted,
    DriveNotFound,
    DriveNotReady,
    WriteNotAllowed,
    FileNotFound,
    ContentUnavailable
}

public enum DeleteDriveDirectoryResultCode
{
    Deleted,
    DriveNotFound,
    DriveNotReady,
    WriteNotAllowed,
    ContentUnavailable
}
