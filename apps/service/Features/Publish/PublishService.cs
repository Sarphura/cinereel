namespace Cinereel.Features.Publish;

internal sealed class PublishService : IPublishService
{
    public Task<IReadOnlyList<PublishedDrive>> ListAsync(
        CancellationToken cancellationToken)
    {
        throw new NotImplementedException("等待确定发布 Drive 的持久化与 Hyper Client Seam。");
    }

    public Task<PublishedDrive> CreateAsync(
        CreatePublishDriveCommand command,
        CancellationToken cancellationToken)
    {
        throw new NotImplementedException("等待确定发布 Drive 的创建流程与失败语义。");
    }
}

public sealed record CreatePublishDriveCommand(
    string Name,
    string ContentType);

public sealed record PublishedDrive(
    string DriveKey,
    string Name,
    string ContentType,
    DateTimeOffset CreatedAt);
