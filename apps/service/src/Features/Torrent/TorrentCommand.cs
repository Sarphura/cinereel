using Ardalis.Result;
using MediatR;

namespace Cinereel.Features.Torrent;

/// <summary>添加下载任务：来源可以是 magnet 链接，也可以是本地 .torrent 文件路径。</summary>
public sealed class AddTorrentCommand : IRequest<Result<TorrentJobDto>>
{
    public string Source { get; set; } = null!;
    public string? SavePath { get; set; }
}

/// <summary>把本地文件或目录制作成种子并立即做种。</summary>
public sealed class CreateTorrentCommand : IRequest<Result<TorrentJobDto>>
{
    public string Path { get; set; } = null!;
}

/// <summary>启动或暂停任务；引擎里已没有对应实例时会按记录的来源重新挂载。</summary>
public sealed class SetTorrentEnabledCommand : IRequest<Result<TorrentJobDto>>
{
    public Guid Id { get; set; }
    public bool Enabled { get; set; }
}

/// <summary>移除任务；DeleteFiles 为 true 时一并删除已下载的内容。</summary>
public sealed class RemoveTorrentCommand : IRequest<Result>
{
    public Guid Id { get; set; }
    public bool DeleteFiles { get; set; }
}
