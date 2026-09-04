namespace Cinereel.Features.Drive;

public enum DeleteDriveFileResultCode
{
    Deleted,
    DriveNotFound,
    DriveNotReady,
    WriteNotAllowed,
    FileNotFound,
    ContentUnavailable
}
