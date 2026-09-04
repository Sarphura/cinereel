namespace Cinereel.Features.Drive;

public enum DeleteDriveDirectoryResultCode
{
    Deleted,
    DriveNotFound,
    DriveNotReady,
    WriteNotAllowed,
    ContentUnavailable
}
