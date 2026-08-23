namespace Cinereel.Features.Drive;

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
