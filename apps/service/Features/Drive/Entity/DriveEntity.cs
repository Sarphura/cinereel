namespace Cinereel.Features.Drive;

internal sealed class DriveEntity
{
    internal Guid Id { get; set; }

    internal string? Key { get; set; }

    internal string Name { get; set; } = string.Empty;

    internal string ContentTypeId { get; set; } = string.Empty;

    internal string? IdempotencyKey { get; set; }

    internal string? CreationRequestHash { get; set; }

    internal DriveStatus Status { get; set; }

    internal DriveRelationType RelationType { get; set; }

    internal string? Remark { get; set; }

    internal DateTimeOffset CreatedAt { get; set; }

    internal DateTimeOffset UpdatedAt { get; set; }
}
