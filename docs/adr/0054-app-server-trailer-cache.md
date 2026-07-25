# App Server caches trailer bytes in `<CINEREEL_DATA_DIR>/trailers/` with a 1 GB LRU cap

The .NET Application Server caches trailer bytes locally so the web UI's seek/replay operations do not repeatedly re-fetch from the Hyper Agent (and ultimately the remote publisher's Hyperdrive). The cache:

- Lives at `<CINEREEL_DATA_DIR>/trailers/<imdb-id-or-local-id>.mp4`.
- Is bounded by total size: 1 GB hard cap, LRU eviction.
- Has no TTL — manual invalidation via `DELETE /api/trailers/{id}` (admin only).
- Is populated on first request to `GET /api/trailers/{id}` and on BT completion when a `trailer.mp4` exists alongside the media item.

## Context

Trailers are 5–30 MB MP4 files streamed from the publisher's Hyperdrive via HTTP Range (ADR 0006). The web UI's trailer player seeks frequently (forward scrub is the dominant action). Without a cache, every seek re-resolves the drive, re-routes to the Hyper Agent, and re-runs Hyperdrive range lookups — adding 50-200ms per seek on a typical home network.

Three plausible cache layers:

- **App Server local cache** — controlled by the application. LRU eviction. Persists across requests.
- **Hyper Agent cache** — inside the Hyper Agent's data directory. Smaller code change but breaks the "Hyper Agent is an IO adapter" boundary (ADR 0044).
- **No cache** — every request re-fetches. Simple but slow for forward seek.

## Decision

App Server local cache, 1 GB LRU.

### Cache key

- IMDb ID if present: `tt1234567` → `trailers/tt1234567.mp4`.
- Otherwise the synthetic local ID: `local-<16hex>` → `trailers/local-<16hex>.mp4`.

### Cache population

Two write paths:

1. **`BT completion hook`**: when `BtScheduler` transitions a torrent to `Completed`, if the source drive has a `trailer.mp4` file at the drive root (per ADR 0015), the App Server pulls its bytes and writes them to the cache.
2. **First request**: `GET /api/trailers/{id}` checks the cache; on miss, fetches from Hyper Agent via `IHyper AgentReadClient.ReadFileAsync(driveKey, "trailer.mp4")`, writes to disk, and returns.

### Read path

`GET /api/trailers/{id}`:

1. Resolve `imdb_id` from the local cache key.
2. Look up `media_items` for the corresponding `drive_key` (one of possibly several subscriptions that include this IMDb ID; pick the most recently updated).
3. If cache hit: stream from disk with HTTP Range support (FastEndpoints' `IFileResponse` or `Results.File(path, contentType, enableRangeProcessing: true)`).
4. If cache miss: stream from Hyper Agent; on `200 OK`, write to disk in the background; if write fails, log and continue.

### LRU eviction

`TrailerCacheMaintainer : BackgroundService` runs every 5 minutes:

- Walks `<data-dir>/trailers/`, computes total size.
- If size > 1 GB, sorts files by `last_accessed_at` and deletes oldest until size < 800 MB.
- Updates `last_accessed_at` on every stream-from-disk.

### Invalidation

- `DELETE /api/trailers/{id}` — admin only; deletes the cache file.
- A re-scan of the resource drive (ADR 0020) does not invalidate the trailer cache automatically. Operators invalidate manually if the trailer changed upstream.

### Failure modes

- Disk full: cache writes fail; `GET /api/trailers/{id}` falls back to streaming from Hyper Agent; warn log.
- Cache file corrupt (write interrupted): on next read, the size in the directory listing differs from the trailer's actual length; delete and refetch.

### What's NOT in V1

- Per-torrent trailer metadata (e.g. resolution, duration) stored alongside the file. The trailer is treated as an opaque MP4.
- Cache hit metrics exposed via `/health`. Logged only.
- Distributed trailer cache (multi-node). Single-node only.

## Trade-off accepted

- 1 GB of disk is consumed by trailers. Acceptable for a NAS deployment.
- A user who deletes a subscription and re-subscribes does not see updated trailer bytes until manual invalidation. The common case is "trailer doesn't change", so this is fine.
- LRU eviction may evict actively-playing trailers if cache pressure is high. Operators can raise the cap by setting `CINEREEL_TRAILER_CACHE_GB=2` env var.