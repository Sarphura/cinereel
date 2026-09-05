namespace Cinereel.Features.Drive;

internal sealed record ReadDriveManifestResult(
    ReadDriveManifestResultCode ResultCode,
    DriveManifest? Manifest = null,
    string? ETag = null,
    long? DriveVersion = null);

internal enum ReadDriveManifestResultCode
{
    Success,
    NotFound,
    Invalid,
    TooLarge,
    UnsupportedSchema,
    UnsupportedContentType,
    Unavailable,
    Timeout
}

internal sealed record WriteDriveManifestResult(WriteDriveManifestResultCode ResultCode);

internal enum WriteDriveManifestResultCode
{
    Written,
    Conflict,
    NotWritable,
    Invalid,
    TooLarge,
    UnknownFields,
    TargetConflict,
    Unavailable,
    Timeout
}
