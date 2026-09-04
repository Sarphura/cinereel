namespace Cinereel.Features.Drive;

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
