namespace Cinereel.Features.Drive;

internal sealed class DriveCreationOperationEntity
{
    internal string IdempotencyKey { get; set; } = string.Empty;

    internal string RequestHash { get; set; } = string.Empty;

    internal Guid DriveId { get; set; }

    internal string Name { get; set; } = string.Empty;

    internal string ContentTypeId { get; set; } = string.Empty;

    internal DriveCreationOperationStatus Status { get; set; }

    internal string? DriveKey { get; set; }

    internal int CompensationAttemptCount { get; set; }

    internal DateTimeOffset CreatedAt { get; set; }

    internal DateTimeOffset UpdatedAt { get; set; }
}
