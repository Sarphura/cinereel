namespace CineReel.Service.Data.Entities;

public enum BtState { Pending, Downloading, Completed, Seeding, Stopped, Failed }

public sealed class TorrentFileEntity
{
    public int MediaItemId { get; set; }
    public MediaItemEntity? MediaItem { get; set; }
    public required string Infohash { get; set; }
    public long TotalBytes { get; set; }
    public long StagedBytes { get; set; }
    public BtState BtState { get; set; } = BtState.Pending;
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}
