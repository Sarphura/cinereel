namespace Cinereel.Features.Drive;

public enum CreateDriveResultCode
{
    Created,
    Replayed,
    IdempotencyConflict,
    Gone
}
