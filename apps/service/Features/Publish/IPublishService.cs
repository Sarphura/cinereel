namespace Cinereel.Features.Publish;

public interface IPublishService
{
    Task<Publication?> GetAsync(
        string driveId,
        CancellationToken cancellationToken);

    Task<PublicationCommandResult> PublishAsync(
        string driveId,
        CancellationToken cancellationToken);

    Task<PublicationCommandResult> UnpublishAsync(
        string driveId,
        CancellationToken cancellationToken);
}
