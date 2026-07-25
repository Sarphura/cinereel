namespace CineReel.Service.Features.Profile;

public sealed record ProfileDto(
    string Name,
    string? Bio,
    string? AvatarPath,
    DateTimeOffset? UpdatedAt,
    IReadOnlyList<CollectionDto> Collections);

public sealed record CollectionDto(string DriveKey, string Name, DateTimeOffset? AddedAt, DateTimeOffset? UpdatedAt);

public sealed record ProfileUpdateRequest(string Name, string? Bio);

public sealed record ProfileUpdated(DateTimeOffset ObservedAt) : CineReel.Service.Events.IDomainEvent;