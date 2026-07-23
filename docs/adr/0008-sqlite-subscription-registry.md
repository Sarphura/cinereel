# Subscription registry and metadata cache live in SQLite (EF Core) under .NET Application Server

The .NET Application Server persists subscription state, parsed Media Item metadata, BT session state, and Jellyfin staging state in a single SQLite database accessed via EF Core. The Hyper Sidecar has no concept of subscription state — that is purely an Application Server concern.

## Context

Subscription state and metadata cache have different lifetimes than drives themselves. A subscription persists even when the source drive is offline. A Media Item cache row exists only after the drive has been scanned. BT session state is independent of the drive lifecycle. Splitting these into separate stores would require cross-store transactions; SQLite is enough for the working set of a single node and gives us transactional guarantees.

## Decision

Single SQLite database at `<data-dir>/cinereel.db` with the following tables.

### `subscriptions`

User-intent table. Created when a user mounts a remote drive; survives drive unavailability.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `drive_key` | TEXT NOT NULL UNIQUE | 64-hex DriveKey |
| `alias` | TEXT | User-given local name |
| `state` | TEXT NOT NULL | `pending` \| `active` \| `failed` |
| `failure_reason` | TEXT | Set when `state = failed` |
| `subscribed_at` | TEXT NOT NULL | ISO 8601 |
| `last_synced_at` | TEXT | Last successful metadata pull |
| `last_descriptor_seen_at` | TEXT | Last seen descriptor hash; detects changes |

### `media_items`

Parsed Media Item cache. One row per `(subscription_id, drive_path)` pair.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `subscription_id` | INTEGER FK | References `subscriptions.id`, `ON DELETE CASCADE` |
| `drive_key` | TEXT NOT NULL | Denormalized for query speed |
| `drive_path` | TEXT NOT NULL | Path inside the drive, e.g. `/Inception (2010)/` |
| `imdb_id` | TEXT | `tt\d+` (ADR 0007) |
| `title` | TEXT NOT NULL | |
| `original_title` | TEXT | |
| `year` | INTEGER | |
| `kind` | TEXT NOT NULL | `movie` \| `episode` \| `album` \| `track` |
| `poster_path` | TEXT | Relative to drive root |
| `nfo_path` | TEXT | Relative to drive root |
| `torrent_path` | TEXT NOT NULL | Relative to drive root |
| `trailer_path` | TEXT | Relative to drive root |
| `last_scanned_at` | TEXT | |
| `jellyfin_state` | TEXT NOT NULL | `pending` \| `pushed` \| `stale` \| `failed` |
| `jellyfin_path` | TEXT | Staging path under Jellyfin library root |

`UNIQUE(subscription_id, drive_path)` prevents duplicates from a re-scan.

### `torrent_files`

BT session state. One row per Media Item. Holds no torrent bytes.

| Column | Type | Notes |
|---|---|---|
| `media_item_id` | INTEGER PK FK | References `media_items.id`, `ON DELETE CASCADE` |
| `infohash` | TEXT NOT NULL | Parsed from `.torrent` bencode |
| `total_bytes` | INTEGER NOT NULL | |
| `staged_bytes` | INTEGER NOT NULL DEFAULT 0 | MonoTorrent progress |
| `bt_state` | TEXT NOT NULL | `pending` \| `downloading` \| `seeding` \| `failed` |

## Indices

```sql
CREATE INDEX idx_media_items_imdb          ON media_items(imdb_id);
CREATE INDEX idx_media_items_drive         ON media_items(drive_key, drive_path);
CREATE INDEX idx_media_items_jellyfin_state ON media_items(jellyfin_state);
CREATE INDEX idx_subscriptions_state       ON subscriptions(state);
```

## Why this shape

- Subscription is user intent and survives drive unavailability → table is `subscriptions`, not driven by Hyper sidecar state.
- Media Item is per-subscription, not global. Two subscribers to the same drive each get their own `media_items` rows. Items are NOT merged across subscriptions — each subscription tracks its own BT session and Jellyfin staging.
- IMDb ID is the only cross-subscription identity. Indexed, but not unique — duplicates allowed.
- Jellyfin staging path is stored so the Application Server can detect drift between Hyperdrive-derived metadata and what's on disk.

## Trade-off accepted

- No cross-subscription de-duplication of torrent downloads. If two subscriptions reference the same IMDb ID, each subscription has its own BT session and its own staging copy. The cost is disk space; the benefit is independent lifecycle (one subscription can be removed without affecting the other).
- SQLite is single-node. If we ever need a multi-node backend, this table set will need migration. That's acceptable because the Application Server is already single-node by design (paired with one Hyper Sidecar).
