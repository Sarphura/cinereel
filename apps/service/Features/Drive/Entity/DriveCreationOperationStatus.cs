namespace Cinereel.Features.Drive;

internal enum DriveCreationOperationStatus
{
    Pending,
    HyperDriveCreated,
    Completed,
    CompensationPending,
    Compensated,
    Tombstoned
}
