# 23 — Jellyfin push: IJellyfinPusher + AsyncKeyedLock per-folder + folder-name sanitisation + idempotent re-push

**What to build:** The Jellyfin bridge (ADR 0007, 0029). `IJellyfinPusher.PushAsync(mediaItem, ct)` writes `<Title> (<Year>) {imdb-<id>}/poster.jpg|movie.nfo|movie.torrent` to the Jellyfin library root. Folder-name sanitisation replaces `/`, `\`, `:`, `*`, `?`, `"`, `<`, `>`, `|` with `-` and trims whitespace. Pushes to *different* folders run in parallel; pushes to the *same* folder serialise via `AsyncKeyedLock<string>` keyed by `imdb-<id>` or `local-<16hex>`. The NFO is normalised (Title, OriginalTitle, Year, ImdbId, Runtime, Plot, Genres, Director, Actor, Studio, Trailer) before write. `IJellyfinCleaner.RemoveAsync(mediaItem, ct)` removes the folder and is wired to `MediaItemRemoved`. A successful push sets `media_items.jellyfin_state = pushed`; a NFO change in a re-scan sets it to `stale`; a push failure sets it to `failed`. Today the Jellyfin bridge does not exist.

**Blocked by:** 18, 22

**Status:** ready-for-agent

- [ ] `Features/Jellyfin/IJellyfinPusher.cs` interface and `JellyfinPusher.cs` implementation
- [ ] `Features/Jellyfin/IJellyfinCleaner.cs` interface and `JellyfinCleaner.cs` implementation
- [ ] `Features/Jellyfin/JellyfinEndpoints.cs` registers `POST /api/media-items/:id/push` (admin only) and `DELETE /api/media-items/:id/jellyfin` (admin only)
- [ ] `Features/Jellyfin/JellyfinFolderName.cs` static helper with `Sanitize(string title)` and `Build(title, year, imdbId)`
- [ ] `Features/Jellyfin/AsyncKeyedLock.cs` generic helper (typed per ADR 0029 — semaphore-per-key ConcurrentDictionary)
- [ ] `Features/Jellyfin/JellyfinHttpClient.cs` typed HTTP client for the Jellyfin `/Library/Media/Updated` and folder-write operations (no-op when `Jellyfin:Url` is null — push to local `Jellyfin:LibraryRoot` only)
- [ ] `JellyfinPusher` registered as `IDomainEventHandler<MediaItemAdded>` and `IDomainEventHandler<MediaItemScanned>`; `JellyfinCleaner` as `IDomainEventHandler<MediaItemRemoved>`
- [ ] Unit tests with fake `IJellyfinHttpClient` + fake `IMediaItemRepository`: happy path, sanitisation, per-folder serialisation, cross-folder parallelism (timing assertion), push failure → `jellyfin_state = failed`, re-push idempotent
- [ ] Integration test: full path — subscribe → scan → push → assert folder exists on disk under a temp library root
