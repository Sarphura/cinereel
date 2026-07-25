namespace CineReel.Service.Features.Publish;

public sealed record AutoPackRequest(
    string LocalVideoPath,
    string DriveName,
    string NfoTitle,
    int? NfoYear,
    string? ImdbId,
    string? PosterPath);

public sealed record AutoPackResponse(
    string DriveKey,
    string Infohash,
    long SizeBytes,
    DateTimeOffset CreatedAt);