using Cinereel.Base.Domain;

namespace Cinereel.Features.Torrent.Entity;

/// <summary>P2P 任务类型：从网络下载，或把本地已有内容做种。</summary>
public enum TorrentJobKind
{
    Download,
    Seed
}

/// <summary>P2P 任务。进度、速率、连接数等运行态不落库，实时从 TorrentEngine 读取。</summary>
public class TorrentJobEntity : FullTrackedEntity
{
    /// <summary>大写十六进制 InfoHash，作为种子的唯一标识。</summary>
    public string InfoHash { get; set; } = null!;

    public string Name { get; set; } = null!;

    public TorrentJobKind Kind { get; set; }

    /// <summary>下载任务的 magnet 链接或 .torrent 路径；做种任务为本地源路径。</summary>
    public string Source { get; set; } = null!;

    /// <summary>做种任务生成的 .torrent 路径，重启后据此重建任务。</summary>
    public string TorrentFilePath { get; set; } = null!;

    public string SavePath { get; set; } = null!;

    public long TotalBytes { get; set; }

    /// <summary>用户期望的运行状态；实际状态以引擎为准。</summary>
    public bool Enabled { get; set; }
}
