using Ardalis.Result;

namespace Cinereel.Features.Drive;

public interface IPublishService
{
    Task<Result<PublicationResponse>> GetAsync(
        string driveId,
        CancellationToken cancellationToken);

    Task<Result<PublicationResponse>> PublishAsync(
        string driveId,
        CancellationToken cancellationToken);

    Task<Result<PublicationResponse>> UnpublishAsync(
        string driveId,
        CancellationToken cancellationToken);
}
