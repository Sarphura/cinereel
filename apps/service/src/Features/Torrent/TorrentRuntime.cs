using Cinereel.Features.Torrent.Entity;
using Cinereel.Infrastructure;
using MonoTorrent;
using MonoTorrent.Client;

namespace Cinereel.Features.Torrent;

/// <summary>数据库记录与引擎实例之间的映射，避免每个处理器重复写查表和投影。</summary>
internal static class TorrentRuntime
{
    public static ClientEngine Engine => TorrentEngine.Instance.Engine;

    public static TorrentManager? Find(string infoHash)
    {
        foreach (var manager in Engine.Torrents)
        {
            if (string.Equals(manager.InfoHashes.V1OrV2.ToHex(), infoHash, StringComparison.OrdinalIgnoreCase))
                return manager;
        }

        return null;
    }

    public static TorrentJobDto ToDto(TorrentJobEntity job)
    {
        var manager = Find(job.InfoHash);

        return manager is null
            ? new TorrentJobDto
            {
                Id = job.Id,
                InfoHash = job.InfoHash,
                Name = job.Name,
                Kind = job.Kind,
                SavePath = job.SavePath,
                TotalBytes = job.TotalBytes,
                Enabled = job.Enabled,
                Status = "Stopped"
            }
            : ToDto(job, manager);
    }

    public static TorrentJobDto ToDto(TorrentJobEntity job, TorrentManager manager)
        => new()
        {
            Id = job.Id,
            InfoHash = job.InfoHash,
            Name = job.Name,
            Kind = job.Kind,
            SavePath = job.SavePath,
            TotalBytes = manager.Torrent?.Size ?? job.TotalBytes,
            Enabled = job.Enabled,
            Status = manager.State.ToString(),
            Progress = manager.Progress,
            DownloadedBytes = manager.Monitor.DataBytesReceived,
            UploadedBytes = manager.Monitor.DataBytesSent,
            DownloadRate = manager.Monitor.DownloadRate,
            UploadRate = manager.Monitor.UploadRate,
            Seeds = manager.Peers.Seeds,
            Leeches = manager.Peers.Leechs
        };

    /// <summary>按记录里的来源把任务重新挂到引擎上（引擎实例丢失或重启恢复时使用）。</summary>
    public static async Task<TorrentManager> AttachAsync(TorrentJobEntity job)
    {
        var engine = Engine;
        TorrentManager manager;

        if (System.IO.File.Exists(job.TorrentFilePath))
        {
            manager = await engine.AddAsync(await MonoTorrent.Torrent.LoadAsync(job.TorrentFilePath), job.SavePath);
        }
        else if (MagnetLink.TryParse(job.Source, out var magnet) && magnet is not null)
        {
            manager = await engine.AddAsync(magnet, job.SavePath);
        }
        else
        {
            manager = await engine.AddAsync(await MonoTorrent.Torrent.LoadAsync(job.Source), job.SavePath);
        }

        await manager.StartAsync();
        return manager;
    }
}
