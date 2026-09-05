using Cinereel.Infrastructure.Persistence;

namespace Cinereel.Features.Drive;

internal sealed class DriveDescriptionService(
    IDriveRepository driveRepository,
    IUnitOfWork unitOfWork,
    DriveCreationLock creationLock,
    TimeProvider timeProvider) : IDriveDescriptionService
{
    public async Task<DriveDescriptionResponse?> GetAsync(
        DriveId driveId,
        CancellationToken cancellationToken)
    {
        var drive = await driveRepository.FindByIdAsync(driveId.Value, cancellationToken);
        return IsVisible(drive) ? ToResponse(drive!) : null;
    }

    public async Task<UpdateDriveDescriptionResult> UpdateAsync(
        DriveId driveId,
        UpdateDriveDescriptionRequest request,
        CancellationToken cancellationToken)
    {
        if (!DriveName.TryCreate(request.Name, out var name) ||
            request.Description is null || request.Description.Length > DriveManifest.MaxDescriptionLength ||
            request.ExpectedRevision < 0)
        {
            return new(UpdateDriveDescriptionResultCode.Invalid);
        }

        var drive = await driveRepository.FindByIdAsync(driveId.Value, cancellationToken);
        if (!IsVisible(drive)) return new(UpdateDriveDescriptionResultCode.NotFound);
        if (drive!.RelationType != DriveRelationType.Ownership)
            return new(UpdateDriveDescriptionResultCode.WriteNotAllowed);

        using var lease = await creationLock.AcquireAsync(
            drive.IdempotencyKey ?? throw new InvalidOperationException("自有 Drive 缺少创建幂等键。"),
            cancellationToken);
        unitOfWork.ClearTrackedEntities();
        drive = await driveRepository.FindByIdAsync(driveId.Value, cancellationToken);
        if (!IsVisible(drive)) return new(UpdateDriveDescriptionResultCode.NotFound);
        if (drive!.RelationType != DriveRelationType.Ownership)
            return new(UpdateDriveDescriptionResultCode.WriteNotAllowed);
        if (drive.ManifestRevision != request.ExpectedRevision)
            return new(UpdateDriveDescriptionResultCode.RevisionConflict, ToResponse(drive));

        if (drive.Name == name.Value && drive.Description == request.Description)
            return new(UpdateDriveDescriptionResultCode.Unchanged, ToResponse(drive));

        var now = DateTimeOffset.FromUnixTimeMilliseconds(
            timeProvider.GetUtcNow().ToUnixTimeMilliseconds());
        var manifest = new DriveManifest(1, name.Value, drive.ContentTypeId, request.Description,
            drive.ManifestCreatedAt, now < drive.ManifestUpdatedAt ? drive.ManifestUpdatedAt : now);
        // 用同一协议校验规则拒绝无法序列化传播的本地输入。
        try
        {
            manifest.Serialize();
        }
        catch (ArgumentException)
        {
            return new(UpdateDriveDescriptionResultCode.Invalid);
        }

        drive.Name = name.Value;
        drive.Description = request.Description;
        drive.ManifestRevision = checked(drive.ManifestRevision + 1);
        drive.ManifestUpdatedAt = manifest.UpdatedAt;
        drive.UpdatedAt = now;
        drive.ManifestErrorCode = null;
        drive.ManifestAttempts = 0;
        drive.ManifestNextAttemptAt = null;
        await unitOfWork.SaveChangesAsync(cancellationToken);
        return new(UpdateDriveDescriptionResultCode.Accepted, ToResponse(drive));
    }

    internal static bool IsVisible(DriveEntity? drive) => drive is not null &&
        drive.RelationType != DriveRelationType.None && drive.Status != DriveStatus.Deleted;

    internal static DriveDescriptionResponse ToResponse(DriveEntity drive) => new(
        drive.Id, drive.Name, drive.ContentTypeId, drive.Description,
        drive.ManifestCreatedAt, drive.ManifestUpdatedAt, drive.ManifestRevision,
        drive.ManifestSyncedRevision,
        drive.RelationType == DriveRelationType.Subscription ? "cached" :
            drive.ManifestSyncedRevision == drive.ManifestRevision ? "synced" :
            drive.ManifestErrorCode is null ? "pending" : "failed",
        drive.ManifestErrorCode);
}
