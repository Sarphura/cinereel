namespace CineReel.Service.Features.Bt;

using CineReel.Service.Data.Entities;

/// <summary>
/// Thin surface the BT scheduler consumes. The default implementation
/// wraps MonoTorrent's <c>ClientEngine</c> (ADR 0028); tests inject a
/// fake. The scheduler owns the per-subscription lifecycle but the
/// engine owns the wire protocol.
/// </summary>
public interface IBtEngine
{
    Task StartAsync(string driveKey, string torrentPath, BtEngineOptions options, CancellationToken cancellationToken = default);
    Task StopAsync(string driveKey, CancellationToken cancellationToken = default);
    Task PauseAsync(string driveKey, CancellationToken cancellationToken = default);
    Task ResumeAsync(string driveKey, CancellationToken cancellationToken = default);
    Task<BtState> GetStateAsync(string driveKey, CancellationToken cancellationToken = default);
    Task BanPeerAsync(string infohash, string ip, CancellationToken cancellationToken = default);
    int ActiveTorrentCount { get; }
}

public sealed record BtEngineOptions(
    int ListenPort,
    int DhtPort,
    long? MaxDownloadBytesPerSecond,
    long? MaxUploadBytesPerSecond);