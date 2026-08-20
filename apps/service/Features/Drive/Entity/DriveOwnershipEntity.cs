namespace Cinereel.Features.Drive;

internal sealed class DriveOwnershipEntity
{
    internal Guid DriveId { get; set; }

    internal string? Remark { get; set; }

    internal DriveEntity Drive { get; set; } = null!;
}
