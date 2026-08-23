namespace Cinereel.Features.Drive;

public enum CreateDriveResultCode
{
    Accepted,
    Replayed,
    IdempotencyConflict,
    Gone
}
