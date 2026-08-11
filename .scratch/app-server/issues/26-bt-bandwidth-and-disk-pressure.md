# 26 — BT governance: BandwidthPolicy + per-peer IPeerConnectionListener throttling + DiskPressureMonitor

**What to build:** The BT-side governance mirroring the Hyper Agent's bandwidth shape (ADR 0009, 0041). `BandwidthPolicy` exposes per-torrent and global caps. A custom `IPeerConnectionListener` wraps every `(torrent, peer)` duplex stream in a throttling stream so per-peer limits are enforceable. `DiskPressureMonitor : BackgroundService` runs every 30 s; when free space drops below `Bt:MinFreeSpaceBytes`, it calls `IBtScheduler.SeedAllButRecentlyAccessedAsync(retainCount: 3)`. Per-torrent `MaxUploadSpeed`/`MaxDownloadSpeed` are applied at `TorrentManagerSettings` construction (ticket 25 left the surface; this ticket fills it). The BT engine runs at OS-default priority (ADR 0041 — no `nice`, no `ionice`). Today the BT engine is registered but no governance exists.

**Blocked by:** 25

**Status:** ready-for-agent

- [ ] `Features/Bt/BandwidthPolicy.cs` — typed options bound from `Bt:*`
- [ ] `Features/Bt/ThrottlingDuplexStream.cs` — a `Stream` decorator that enforces a per-second byte budget
- [ ] `Features/Bt/ThrottlingPeerConnectionListener.cs` — implements `IPeerConnectionListener` and wraps each accepted connection in a `ThrottlingDuplexStream`
- [ ] `Features/Bt/DiskPressureMonitor.cs` `BackgroundService` polling `DriveInfo.AvailableFreeSpace` every 30 s and calling `SeedAllButRecentlyAccessedAsync` on threshold breach
- [ ] Per-torrent settings wired in `BtScheduler.StartAsync` — reads `BandwidthPolicy` and applies to `TorrentManagerSettings`
- [ ] Cross-layer blacklist propagation: a Hyper-side ban can be pushed to the BT engine via `IBtEngine.BanPeerAsync(infohash, ip)`; the Hyper Agent notifies the App Server via `POST /api/internal/blacklist-from-hyper`
- [ ] Unit tests with a fake `IBtEngine`: DiskPressureMonitor triggers seed-stop at threshold; per-peer throttling enforces a 10 KB/s cap (timing assertion)
- [ ] No new endpoint — internal-only
- [ ] Anti-leech policies (excessive download + repeated reconnect) live in `Features/Bt/AntiLeechMonitor.cs` consuming MonoTorrent events; unit tests for the two triggers
