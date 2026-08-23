namespace Cinereel.Features.Drive;

internal sealed class DriveEntity
{
    internal Guid Id { get; set; }

    internal string Key { get; set; } = string.Empty;

    internal string Name { get; set; } = string.Empty;

    internal string ContentTypeId { get; set; } = string.Empty;

    internal DriveRelationType RelationType { get; set; }

    internal string? Remark { get; set; }

    internal DateTimeOffset CreatedAt { get; set; }

    internal DateTimeOffset UpdatedAt { get; set; }
}
