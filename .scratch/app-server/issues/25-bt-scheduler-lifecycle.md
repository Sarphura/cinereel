# 25 — BT scheduler: IBtScheduler lifecycle (Pending → Downloading → Completed → Seeding → Stopped)

**What to build:** The BT lifecycle from ADR 0028. `IBtScheduler.ScanAsync(subscriptionId)` starts a `TorrentManager` per `torrent_files` row of the subscription. `IBtScheduler.StopAsync(subscriptionId)` stops every `TorrentManager` for the subscription (called by `SubscriptionDeleted` handler). `IBtScheduler.PauseSeedingAsync(mediaItemId)` and `ResumeAsync(mediaItemId)` are per-Media-Item. The state machine maps MonoTorrent's `TorrentManager.State` to `BtState ∈ { Pending, Downloading, Completed, Seeding, Stopped, Failed }`. The scheduler is registered as `IDomainEventHandler<MediaItemAdded>` (start), `IDomainEventHandler<SubscriptionDeleted>` (stop). Per-torrent `MaxUploadSpeed`/`MaxDownloadSpeed` are applied via `TorrentManagerSettings`. Global caps come from `Bt:ListenPort`, `Bt:DhtPort`, and `Bt:MaxUploadSpeed`/`Bt:MaxDownloadSpeed`. Today no BT code exists.

**Blocked by:** 01, 18

**Status:** ready-for-agent

- [ ] `Features/Bt/IBtScheduler.cs` interface with the documented methods
- [ ] `Features/Bt/BtScheduler.cs` implementation using `MonoTorrent.Client` (`ClientEngine`, `TorrentManager`, `TorrentSettings`)
- [ ] `Features/Bt/IBtEngine.cs` interface (the thin surface `BtScheduler` consumes) — wraps the MonoTorrent `ClientEngine`
- [ ] `Features/Bt/BtState.cs` enum mapping to MonoTorrent states
- [ ] `Features/Bt/BtEndpoints.cs` registers `POST /api/media-items/:id/pause-seeding` and `POST /api/media-items/:id/resume-seeding`
- [ ] `MonoTorrent.Client` NuGet added to the `.csproj`
- [ ] `IBtEngineHealthProbe` (ticket 15) now wired to `IBtScheduler.ActiveTorrentCount`
- [ ] Unit tests with a fake `IBtEngine`: state transitions, per-subscription stop, per-item pause/resume
- [ ] Integration test: subscribe → scan → assert a `torrent_files` row + a `TorrentManager` is started (verifiable by an `IBtEngine` fake that records calls)
- [ ] Bandwidth policy + per-peer throttling land in ticket 26; this ticket uses global caps only
