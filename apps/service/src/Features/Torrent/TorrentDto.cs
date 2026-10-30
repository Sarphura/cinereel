using Cinereel.Features.Torrent.Entity;

namespace Cinereel.Features.Torrent;

/// <summary>任务的持久化字段 + 引擎实时运行态。</summary>
public sealed class TorrentJobDto
{
    public Guid Id { get; set; }
    public string InfoHash { get; set; } = null!;
    public string Name { get; set; } = null!;
    public TorrentJobKind Kind { get; set; }
    public string SavePath { get; set; } = null!;
    public long TotalBytes { get; set; }
    public bool Enabled { get; set; }

    public string Status { get; set; } = null!;
    public double Progress { get; set; }
    public long DownloadedBytes { get; set; }
    public long UploadedBytes { get; set; }
    public long DownloadRate { get; set; }
    public long UploadRate { get; set; }
    public int Seeds { get; set; }
    public int Leeches { get; set; }
}
