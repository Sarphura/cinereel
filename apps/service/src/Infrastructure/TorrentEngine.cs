using System.Net;
using MonoTorrent.Client;

namespace Cinereel.Infrastructure;

/// <summary>
/// 进程内唯一的 Torrent 引擎宿主：首次访问 <see cref="Instance"/> 时创建，之后复用同一个 ClientEngine。
/// </summary>
public sealed class TorrentEngine : IDisposable
{
    private static readonly Lazy<TorrentEngine> LazyInstance = new(() => new TorrentEngine());

    public static TorrentEngine Instance => LazyInstance.Value;

    private readonly ClientEngine _engine;
    private readonly string _rootPath;

    public ClientEngine Engine => _engine;

    /// <summary>下载内容与缓存的根目录。</summary>
    public string RootPath => _rootPath;

    /// <summary>做种时生成的 .torrent 文件存放目录。</summary>
    public string TorrentDirectory => Path.Combine(_rootPath, "torrents");

    private TorrentEngine()
    {
        _rootPath = "/data/torrents";

        _engine = new ClientEngine(new EngineSettingsBuilder
        {
            CacheDirectory = Path.Combine(_rootPath, "cache"),   // fast resume / .torrent 副本缓存
            ListenEndPoints = new Dictionary<string, IPEndPoint>
            {
                ["ipv4"] = new IPEndPoint(IPAddress.Any, 55125), // 端口 0 = 随机，-1 = 不监听
            },
            MaximumConnections = 200,          // 全局连接数上限
            MaximumDownloadRate = 0,           // 全局限速，bytes/s，0 = 不限
            MaximumUploadRate = 0,
            AllowPortForwarding = true,        // UPnP / NAT-PMP
            HttpStreamingPrefix = "http://127.0.0.1:5555/", // 边下边播用，必须以 / 结尾
        }.ToSettings());
    }

    public void Dispose() => _engine.Dispose();
}