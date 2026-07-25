using CineReel.Service.Data.Entities;

namespace CineReel.Service.Features.Bt;

/// <summary>
/// No-op BT engine used when MonoTorrent is not active (tests and the
/// first-launch path). Real deployments should swap in a MonoTorrent
/// backed implementation. All operations are idempotent and return
/// <c>BtState.Stopped</c>.
/// </summary>
public sealed class NoopBtEngine : IBtEngine
{
    public int ActiveTorrentCount => 0;
    public Task StartAsync(string driveKey, string torrentPath, BtEngineOptions options, CancellationToken cancellationToken = default) => Task.CompletedTask;
    public Task StopAsync(string driveKey, CancellationToken cancellationToken = default) => Task.CompletedTask;
    public Task PauseAsync(string driveKey, CancellationToken cancellationToken = default) => Task.CompletedTask;
    public Task ResumeAsync(string driveKey, CancellationToken cancellationToken = default) => Task.CompletedTask;
    public Task<BtState> GetStateAsync(string driveKey, CancellationToken cancellationToken = default) => Task.FromResult(BtState.Stopped);
}