namespace Cinereel.Features.Drive;

internal sealed class PublishService : IPublishService
{
    public Task<Publication?> GetAsync(
        string driveId,
        CancellationToken cancellationToken)
    {
        throw new NotImplementedException("等待确定 Publication 的持久化方式。");
    }

    public Task<PublicationCommandResult> PublishAsync(
        string driveId,
        CancellationToken cancellationToken)
    {
        throw new NotImplementedException("等待实现 Publish 状态机与可靠异步受理。");
    }

    public Task<PublicationCommandResult> UnpublishAsync(
        string driveId,
        CancellationToken cancellationToken)
    {
        throw new NotImplementedException("等待实现 Unpublish 状态机与可靠异步受理。");
    }
}
