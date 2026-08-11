# 27 — Trailer cache: 1 GB LRU + GET /api/trailers/:id + BT-completion warmer

**What to build:** The trailer cache from ADR 0054. `ITrailerCache.LookupAsync(imdbOrLocalId, ct)` returns either the cached bytes or `null`. `ITrailerCache.StoreAsync(imdbOrLocalId, driveKey, ct)` fetches via `IHyperAgentReadClient.ReadFileAsync(driveKey, "trailer.mp4")` and writes to `<CINEREEL_DATA_DIR>/trailers/<id>.mp4`. `GET /api/trailers/:id` reads cache, on miss fetches from Hyper Agent, writes to disk, streams back. `TrailerCacheMaintainer : BackgroundService` runs every 5 minutes; sorts by `lastAccessedAt` and evicts oldest until total size < 800 MB. `TrailerCacheWarmer` is `IDomainEventHandler<TorrentDownloadCompleted>` and seeds the cache when a publisher's drive has `trailer.mp4` at the movie folder root. A cache file with size mismatch is deleted and re-fetched on the next read. Disk-full falls back to streaming from the Hyper Agent and logs a warning.

**Blocked by:** 06, 25

**Status:** ready-for-agent

- [ ] `Features/Trailers/ITrailerCache.cs` interface and `TrailerCache.cs` implementation
- [ ] `Features/Trailers/TrailerCacheMaintainer.cs` `BackgroundService` running every 5 minutes
- [ ] `Features/Trailers/TrailerCacheWarmer.cs` `IDomainEventHandler<TorrentDownloadCompleted>` registered via DI
- [ ] `Features/Trailers/TrailerEndpoints.cs` registers `GET /api/trailers/:id` and `DELETE /api/trailers/:id` (admin only)
- [ ] `Cinereel:TrailerCacheGB` configures the cap; default 1
- [ ] Cache key: `imdb-<id>` when present, else `local-<16hex>` (consistent with `MediaItem`)
- [ ] `lastAccessedAt` updated on every stream-from-disk read
- [ ] Size-mismatch detection: cache file size ≠ Hyper Agent content length → delete and re-fetch
- [ ] Unit tests: cache hit, cache miss → fetch + write, eviction (cap at 1 GB, evict until 800 MB), size-mismatch re-fetch, disk-full fallback (simulated by a fake `IFileSystem`)
- [ ] Integration test: warm cache via `TorrentDownloadCompleted` event → assert trailer file exists on disk → GET endpoint returns 200 with cached bytes
