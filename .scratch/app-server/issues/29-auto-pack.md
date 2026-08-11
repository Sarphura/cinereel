# 29 — Auto-Pack: POST /api/publish/pack takes a local video file, generates a .torrent, writes the resource drive

**What to build:** The Auto-Pack workflow from spec §91–94. `IAutoPackService.PackAsync(localVideoPath, driveName, ct)` runs MonoTorrent's `TorrentCreator` to produce a `.torrent` for the file, then writes `movie.nfo` + `poster.jpg` + `movie.torrent` to a freshly-created resource drive via `IHyperAgentWriteClient.CreateDriveAsync` + `WriteFileAsync`. The drive's `descriptor.json` is written with `ownerProfileKey = mainDriveKey`. `POST /api/publish/pack` accepts `{ localVideoPath, driveName, nfoTitle, nfoYear, imdbId?, posterPath? }`, calls `PackAsync`, returns the new `driveKey`. The new drive triggers `MediaItemAdded` via the bus, which the JellyfinPusher picks up. Today no Auto-Pack exists.

**Blocked by:** 18, 25

**Status:** ready-for-agent

- [ ] `Features/Publish/IAutoPackService.cs` interface and `AutoPackService.cs` implementation
- [ ] `Features/Publish/AutoPackRequest.cs` DTO and `AutoPackResponse.cs`
- [ ] `Features/Publish/PublishEndpoints.cs` registers `POST /api/publish/pack` with `[RequirePermission("publish:create")]`
- [ ] `MonoTorrent.Client` `TorrentCreator` produces the `.torrent`; SHA-1 hash becomes the `Infohash` value object
- [ ] `descriptor.json` shape: `{ name, type: "metadata", ownerProfileKey, createdAt }`
- [ ] `movie.nfo` written as a minimal Kodi-compatible XML with Title, Year, ImdbId, Plot from the request
- [ ] On any step failure, the partially-created drive is rolled back via `IHyperAgentWriteClient.DeleteFileAsync` (best effort)
- [ ] Unit tests with fake `IHyperAgentWriteClient`: happy path, partial-failure rollback, missing local file → 400
- [ ] Integration test: real video file → real AutoPack → assert drive contains descriptor.json + movie.nfo + poster.jpg + movie.torrent; assert Jellyfin push fires (via observable event handler)
- [ ] Error mapping: file-not-found → 400 `invalid-input`; torrent-creation failure → 503 `bt-engine-unavailable`
