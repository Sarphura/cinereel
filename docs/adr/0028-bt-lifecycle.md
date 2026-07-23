# BT lifecycle: download → seeding; seeding ends when subscription ends or disk pressure is high

Each Media Item's BT session has a state machine managed by `BtScheduler`:

```
Pending → Downloading → Completed → Seeding
                  ↘ Failed ↗
Seeding → Stopped (when subscription cancelled OR disk pressure high)
Failed → Pending (manual retry)
```

The Cinereel-Peer Seed role is the default V1 behaviour (ADR 0003): when a media item's download completes, its `TorrentManager` continues uploading. Seeding stops when (a) the user cancels the subscription, (b) the disk-pressure monitor marks the staging directory as low-space, or (c) the user manually pauses seeding from the web UI.

## Context

After ADR 0003 established Cinereel-Peer Seed as a default behaviour and ADR 0009 mirrored transport governance between Hyper and BT layers, the remaining question is when seeding ends. Three plausible stopping conditions:

- Subscription cancellation (lifecycle coupling).
- Disk pressure (resource coupling).
- Share-ratio threshold (BT-ecosystem default).

## Decision

Subscription cancellation is the primary trigger. Disk pressure is a safety valve. Share-ratio is out of scope (Cinereel is a personal library, not a public-tracker client).

### State machine

| From | To | Trigger |
|---|---|---|
| Pending | Downloading | MonoTorrent's `TorrentManager.State` transitions from Starting to Downloading |
| Downloading | Completed | MonoTorrent reports `State = Seeding` (all pieces verified) |
| Downloading | Failed | MonoTorrent reports error or piece-hash mismatch |
| Completed | Seeding | Same — the MonoTorrent state transition is the source of truth |
| Seeding | Stopped | Subscription cancelled, disk pressure high, or user paused |
| Failed | Pending | User clicks "Retry" in the web UI |

### Subscription cancellation

When the user deletes a subscription:

1. `SubscriptionService.DeleteAsync` raises `SubscriptionDeleted`.
2. `BtScheduler` handles the event: for each `TorrentManager` associated with the subscription, calls `TorrentManager.StopAsync()`.
3. The staged video file in the Jellyfin library root is removed by `JellyfinPusher` (separate handler).
4. SQLite's `media_items` row is deleted via `ON DELETE CASCADE`.

### Disk-pressure monitor

`DiskPressureMonitor : BackgroundService` runs every 30 seconds:

1. Checks free space on the staging partition via `DriveInfo.AvailableFreeSpace`.
2. If free space < 5 GB (configurable in `appsettings.json` under `Bt:MinFreeSpaceBytes`), calls `BtScheduler.SeedAllButRecentlyAccessedAsync(retainCount: 3)`.
3. `BtScheduler` keeps the 3 most recently accessed torrents seeding and stops the rest. The stopped torrents can be restarted by re-triggering the BT session (the staged file is deleted, so the BT client would have to re-download — this is acceptable for V1).

### Manual pause

The web UI shows a "Pause seeding" button per Media Item. Clicking calls `POST /api/media-items/:id/pause-seeding`. `BtScheduler` calls `TorrentManager.PauseAsync()`. The session is paused, not removed; resume calls `StartAsync()`.

### What is NOT in V1

- Share-ratio thresholds.
- Time-based seeding ("seed for 24 hours then stop").
- Per-torrent upload caps (only per-engine global caps exist in V1).
- Public tracker integration (V1 swarms are BT-public + Cinereel-peer only).

## Trade-off accepted

- Subscription cancellation cascades to seeding stops. If the user resubscribes, they must re-download — BT sessions are not persisted across subscription lifecycles.
- Disk-pressure stopping is crude (keep N, drop the rest). A better algorithm would stop the torrent whose seeders-outnumber-leechers the most. That's V2.
- The pause feature is per Media Item, not per subscription. A user pausing seeding for one item doesn't affect siblings.