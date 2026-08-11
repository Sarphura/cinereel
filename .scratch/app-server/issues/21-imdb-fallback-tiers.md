# 21 — IMDb fallback tiers: TMDB lookup (opt-in) + synthetic local-<16hex> ID

**What to build:** The fallback chain from ADR 0016. When a `ParsedNfo` has no `ImdbId`, the App Server applies two tiers in order. Tier 1 (online, opt-in): if `Tmdb:ApiKey` is configured, call TMDB's `/search/movie?api_key=...&query=<title>&year=<year>` endpoint and take the first result's IMDb ID. If no result is returned, fall through immediately. Tier 2 (offline, always-on): derive `local-<16hex>` from `sha256(driveKey || ':' || drive_path)` truncated to 16 hex chars. The result is stored in `media_items.imdb_id`. A later re-scan that finds an IMDb ID in a previously-synthetic NFO renames the Jellyfin staging folder from `local-*` to `imdb-*` (the rename itself lands with the Jellyfin ticket 23). Today no IMDb resolution exists.

**Blocked by:** 20

**Status:** ready-for-agent

- [ ] `Features/Metadata/IIMDBResolver.cs` interface and `IMDbResolver.cs` with `ResolveAsync(parsedNfo, driveKey, drivePath, ct)` returning `(string imdbId, IDKind kind)` where `IDKind ∈ { Tmdb, Synthetic }`
- [ ] `Features/Metadata/TmdbClient.cs` HTTP client calls TMDB `/search/movie` with title + year, takes the first result's `imdb_id`, and is gated on `Tmdb:ApiKey` presence
- [ ] `Features/Metadata/SyntheticIdGenerator.cs` static helper producing `local-<16hex>` from `sha256(driveKey || ':' || drive_path)`
- [ ] Caching rule: Tier 1 result is cached in `media_items.imdb_id`; a failed lookup is NOT retried (avoids API rate-limit loops)
- [ ] The synthetic ID is stable across re-publishes of the same `(driveKey, drivePath)` (verified by unit test)
- [ ] Unit tests with a fake `TmdbClient`: Tier 1 success, Tier 1 disabled, Tier 1 failure → Tier 2, Tier 2 always-on when Tier 1 absent
- [ ] No event fires yet — the scanner ticket (22) wires `SubscriptionCreated` → resolve
