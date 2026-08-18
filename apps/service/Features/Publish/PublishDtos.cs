namespace Cinereel.Features.Publish;

public sealed record CreatePublishDriveRequest(
    string Name,
    string ContentType)
{
    internal CreatePublishDriveCommand ToCommand() => new(Name, ContentType);
}

public sealed record PublishDriveResponse(
    string DriveKey,
    string Name,
    string ContentType,
    DateTimeOffset CreatedAt)
{
    internal static PublishDriveResponse From(PublishedDrive drive) =>
        new(drive.DriveKey, drive.Name, drive.ContentType, drive.CreatedAt);
}
