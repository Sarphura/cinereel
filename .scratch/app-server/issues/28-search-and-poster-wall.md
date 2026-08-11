# 28 — Search & poster wall: GET /api/media-items with FTS5 + poster byte endpoint

**What to build:** The search and poster wall surface (spec §79–83). `IPosterWallService.SearchAsync(query, ct)` runs an FTS5 query against `media_items(title, original_title)`. `GET /api/media-items?imdb=tt1375666` returns every row matching that IMDb ID. `GET /api/media-items?title=incep` does a case-insensitive substring match. `GET /api/media-items/:id/poster` returns the poster bytes from the Hyper Agent via `IHyperAgentReadClient.ReadFileAsync(driveKey, posterPath)` with `Content-Type: image/jpeg`. `POST /api/media-items/:id/poster/invalidate` (admin only) clears the local cache for that poster. Results are deduplicated by `imdb_id` per request. FTS5 indices are added in a follow-up EF migration. Today the search and poster wall do not exist.

**Blocked by:** 04, 06

**Status:** ready-for-agent

- [ ] `Features/Search/IPosterWallService.cs` interface and `PosterWallService.cs` implementation
- [ ] `Features/Search/SearchEndpoints.cs` registers the documented endpoints
- [ ] EF Core migration `AddFts5Indices` adds an FTS5 virtual table `media_items_fts(title, original_title)` plus triggers to keep it in sync
- [ ] `IMediaItemRepository.SearchAsync(query, ct)` runs the FTS5 query; empty query returns the most-recently-added 50 items
- [ ] `GET /api/media-items/:id/poster` streams the bytes with `Content-Type` from extension sniffing (`image/jpeg`, `image/png`, `image/webp`); `Cache-Control: public, max-age=3600`
- [ ] Deduplication: when two subscriptions reference the same IMDb ID, the result row carries both `subscription_id`s in a `subscriptionIds` array
- [ ] Unit tests with `InMemoryMediaItemRepository`: IMDb ID match, title substring, dedup, empty result
- [ ] Integration test: `WebApplicationFactory<Program>` with a seed of 5 items, FTS5 query returns the right rows
- [ ] Performance: FTS5 query < 10 ms on 10k items (verified in a benchmark with `[Trait("Category","Benchmark")]`, opt-in)
