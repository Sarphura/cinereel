using System.Net;
using MonoTorrent.Connections.TrackerServer;
using MonoTorrent.TrackerServer;

namespace Cinereel.Infrastructure;

/// <summary>
/// 进程内的 BitTorrent Tracker 服务（HTTP + UDP），随宿主应用一起启动和停止。
/// 默认允许未登记的种子直接被追踪，见配置节 <c>Torrent:Tracker</c>。
/// </summary>
public sealed class TorrentTracker : IHostedService, IDisposable
{
    private readonly TrackerServer _tracker = new();
    private readonly List<ITrackerListener> _listeners = new();

    public TrackerServer Server => _tracker;

    public TorrentTracker(IConfiguration configuration)
    {
        var section = configuration.GetSection("Torrent:Tracker");
        var allowUnregisteredTorrents = section.GetValue("AllowUnregisteredTorrents", true);
        _tracker.AllowUnregisteredTorrents = allowUnregisteredTorrents;

        if (section.GetValue("EnableHttp", true))
        {
            var httpPrefix = section["HttpPrefix"] ?? "http://127.0.0.1:10000/announce/";
            var httpListener = new HttpTrackerListener(httpPrefix);
            _tracker.RegisterListener(httpListener);
            _listeners.Add(httpListener);
        }

        if (section.GetValue("EnableUdp", true))
        {
            var udpAddress = IPAddress.Parse(section["UdpAddress"] ?? "127.0.0.1");
            var udpPort = section.GetValue("UdpPort", 10001);
            var udpListener = TrackerListenerFactory.CreateUdp(new IPEndPoint(udpAddress, udpPort));
            _tracker.RegisterListener(udpListener);
            _listeners.Add(udpListener);
        }
    }

    public Task StartAsync(CancellationToken cancellationToken)
    {
        foreach (var listener in _listeners)
            listener.Start();

        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken)
    {
        foreach (var listener in _listeners)
            listener.Stop();

        return Task.CompletedTask;
    }

    public void Dispose()
    {
        foreach (var listener in _listeners)
            _tracker.UnregisterListener(listener);

        _tracker.Dispose();
    }
}
