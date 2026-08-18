namespace Cinereel.Features.Publish;

public interface IPublishService
{
    Task<IReadOnlyList<PublishedDrive>> ListAsync(
        CancellationToken cancellationToken);

    Task<PublishedDrive> CreateAsync(
        CreatePublishDriveCommand command,
        CancellationToken cancellationToken);
}
