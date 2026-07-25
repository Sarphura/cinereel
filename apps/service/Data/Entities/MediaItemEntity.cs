namespace CineReel.Service.Data.Entities;

public enum MediaItemKind { Movie, Episode, Album, Track }
public enum JellyfinState { Pending, Pushed, Stale, Failed }

public sealed class MediaItemEntity
{
    public int Id { get; set; }
    public int SubscriptionId { get; set; }
    public SubscriptionEntity? Subscription { get; set; }
    public required string DriveKey { get; set; }
    public required string DrivePath { get; set; }
    public required string DescriptorHash { get; set; }
    public string? ImdbId { get; set; }
    public required string Title { get; set; }
    public string? OriginalTitle { get; set; }
    public int? Year { get; set; }
    public MediaItemKind Kind { get; set; } = MediaItemKind.Movie;
    public string? PosterPath { get; set; }
    public string? NfoPath { get; set; }
    public required string TorrentPath { get; set; }
    public string? TrailerPath { get; set; }
    public DateTimeOffset? LastScannedAt { get; set; }
    public JellyfinState JellyfinState { get; set; } = JellyfinState.Pending;
    public string? JellyfinPath { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public TorrentFileEntity? TorrentFile { get; set; }
}
