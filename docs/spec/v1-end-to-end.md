# Cinereel V1 — End-to-End Local-First Media Library

> Synthesized from 53 ADRs and `CONTEXT.md` (terminology + glossary).

## Problem Statement

A self-hosting media enthusiast has hundreds of high-bitrate movies on a local NAS. They want to:

- **Publish** their collection so that friends (and themselves from other devices) can subscribe to it.
- **Subscribe** to friends' collections without running a Plex/Jellyfin-server-per-friend.
- **Watch** via the playback tool they already use (Jellyfin) without fighting transcodes, library rescan delays, or cloud sync.
- **Operate** the whole thing on a NAS with no cloud account, no port forwarding, no public IP — and have it survive reboots, NAS swaps, and intermittent connectivity.

Today's options are all wrong for this person:

- **Plex / Jellyfin server-per-friend** means N copies of every file, N transcodes, N servers to keep updated.
- **qBittorrent + RSS feeds** is content-shaped, not library-shaped; no posters, no metadata, no share with friends unless you hand out server URLs.
- **Syncthing** syncs bytes but doesn't model "library, poster, NFO, trailer, torrent" as a unit; friends get raw folders.
- **Cloud solutions** (Plex Cloud, Stremio with TMDB, etc.) break local-first and leak privacy.

Cinereel is a local-first, P2P-distributed media library platform: a node is a single host the user controls; it publishes resource drives via Hyperdrive (carrying identity, profile, NFO, posters, trailers, .torrent files) and seeds BT swarms (carrying video bytes). Subscribers mount publishers' drives, consume metadata automatically, and fetch video on demand via BT.

The goal of V1 is one node working end-to-end on a single machine: publish a resource drive, mount a remote drive, browse the poster wall, push to Jellyfin, download a media item via BT, and seed it back to the swarm — all driven by a small web UI, with credentials, RBAC, and a deployable Docker image.

## Solution

A single Cinereel node consists of three processes co-located on one host:

- **Hyper Sidecar** — Node 22 + NestJS, wraps `hyper-sdk`. Owns drive mount/unmount, swarm announce, file read/write over Hyperdrive. Exposes a token-authenticated HTTP API on `127.0.0.1:4201`. No business logic.
- **Application Server** — .NET 10, Minimal API. Owns subscription registry, metadata cache, poster wall data, Jellyfin bridge, MonoTorrent scheduler, auto-pack torrent, RBAC, account auth. Exposes an OpenAPI-documented HTTP API on `127.0.0.1:8090`. SPA is served from the same origin.
- **Jellyfin (external)** — the user's existing playback server. Cinereel pushes metadata into it; Cinereel does not host the transcode.

Three P2P networks coexist:

- **Hyperdrive swarm** carries identity, profile, descriptors, NFO, posters, trailers, and `.torrent` files.
- **BitTorrent swarm** carries the video bytes referenced by those `.torrent` files.
- **HTTP** carries metadata push from App Server to local Jellyfin.

The Cinereel-Peer Seed pattern is the default: when a subscriber finishes downloading, their MonoTorrent session continues seeding so the swarm stays healthy even if the publisher goes offline.

The user experiences this as:

1. They run a single Docker container (or `pnpm dev`) on their NAS.
2. They open `http://nas:8090`, log in with the bootstrap admin account.
3. They create a resource drive from a local video file → Cinereel auto-packs a `.torrent`, mounts it, and announces it.
4. They (or a friend, given the drive key) mount the drive by key → the poster wall shows the items.
5. They click an item → MonoTorrent fetches the video → the file appears in the Jellyfin library → they play it via Jellyfin.
6. Their node continues seeding the BT payload so other subscribers can fetch.

## User Stories

### Publisher — creating and managing content

1. As a publisher, I want to give my Cinereel node a public name and avatar, so that subscribers see who they're subscribing to.
2. As a publisher, I want to create a new resource drive for a movie collection, so that I can curate content independently of my other drives.
3. As a publisher, I want to import a local video file into a resource drive, so that the file is automatically `.torrent`-packed and ready for distribution.
4. As a publisher, I want Cinereel to compute and embed an SHA-1 infohash for the torrent, so that subscribers can deduplicate by infohash.
5. As a publisher, I want to choose a piece size for the torrent, so that I can optimize for the typical payload size of my media.
6. As a publisher, I want to fetch trailer URLs from a Hyperdrive metadata source, so that I can offer preview videos to subscribers.
7. As a publisher, I want my resource drive's descriptor to reference my main drive's profile, so that subscribers can resolve my identity.
8. As a publisher, I want Cinereel to write a Kodi-compatible `movie.nfo` per media item, so that Jellyfin can read standard metadata.
9. As a publisher, I want to mark a resource drive as `metadata`, `resource`, `series`, or `music`, so that the poster wall renders it appropriately.
10. As a publisher, I want to delete a resource drive, so that I can retire content I no longer want to share.
11. As a publisher, I want to inspect a drive's content tree, so that I can verify what's been packaged.

### Subscriber — discovering and consuming content

12. As a subscriber, I want to enter a publisher's drive key and mount their resource drive, so that I can browse and download from it.
13. As a subscriber, I want to see a poster wall of all my mounted resource drives' items, so that I have a single browse surface.
14. As a subscriber, I want to see the IMDb ID for each movie, so that I can pull extra metadata (poster, plot, trailer) if available.
15. As a subscriber, I want Cinereel to fall back to a synthetic `local-<hex>` ID when no IMDb ID is found, so that every media item has a stable identity.
16. As a subscriber, I want to see the trailer player inline on the poster wall, so that I can preview without leaving the page.
17. As a subscriber, I want the trailer stream to support HTTP `Range` requests, so that seek works.
18. As a subscriber, I want to see the current download progress of every torrent, so that I know what's available now and what's still pulling.
19. As a subscriber, I want to start, pause, resume, and remove a BT download, so that I can manage my disk space.
20. As a subscriber, I want Cinereel to keep seeding downloaded items indefinitely, so that I contribute to the swarm.
21. As a subscriber, I want my Cinereel node to push media items into my local Jellyfin server, so that I can play them through the standard Jellyfin interface.
22. As a subscriber, I want Cinereel to manage a stable Jellyfin folder structure per media item (e.g. `Movies/Inception (2010) {imdb-tt1375666}/movie.mp4`), so that Jellyfin's scanner does not duplicate or lose items.
23. As a subscriber, I want the Jellyfin push to be idempotent, so that re-pushing the same item is a no-op.
24. As a subscriber, I want Cinereel to delete the Jellyfin folder when I unsubscribe, so that my Jellyfin library stays in sync with my subscriptions.

### Account & access control

25. As an admin, I want to log into Cinereel with a username and password, so that I can manage the node.
26. As an admin, I want Cinereel to create a bootstrap admin account on first run, so that I can log in initially.
27. As an admin, I want to create additional accounts and assign permissions to them, so that I can share access with family without giving full control.
28. As a viewer, I want to log in and see the poster wall but not the publish or admin pages, so that I can browse without risk.
29. As an admin, I want Cinereel to log me out after 30 days of inactivity, so that stale sessions don't accumulate.
30. As a user, I want my session cookie to be HttpOnly and Secure, so that XSS and network sniffing don't compromise my account.

### Discovery (cross-node)

31. As a user, I want Cinereel to support a manual drive-key entry form for now, so that I can share with friends without a registry.
32. As a future user, I want Cinereel to support a discover endpoint listing known nodes, so that I can browse publishers — but this is V2 scope.

### Operational — installation, startup, monitoring

33. As an operator, I want to install Cinereel via a single Docker image, so that deployment is one command.
34. As an operator, I want the Sidecar and App Server to start together and fail together, so that I never have a half-running node.
35. As an operator, I want the App Server to verify the Sidecar's version on startup, so that mismatched versions fail loudly.
36. As an operator, I want a `/health` endpoint that reports Sidecar + SQLite status (required) and Jellyfin / BT / disk (informational), so that I can monitor the node.
37. As an operator, I want structured JSON logs to stdout, so that I can ingest them with Docker / journald / Loki.
38. As an operator, I want human-readable rotating log files in `<data-dir>/logs/`, so that I can read the last 14 days locally.
39. As an operator, I want all Cinereel data in one directory (`~/.cinereel/` by default), so that backups are one command.
40. As an operator, I want to override the data directory and ports via environment variables, so that I can customize the install.

### Reliability — error handling

41. As a user, I want transient failures (Sidecar RPC timeout, Jellyfin 502) to be retried with backoff, so that I don't see flapping errors.
42. As a user, I want non-recoverable failures (NFO corruption, schema mismatch) to surface as a `failed` state, so that I can retry manually.
43. As an operator, I want a 60-second background sweep over failed entities, so that I don't have to retry manually every time.
44. As an operator, I want to see problem-detail JSON on errors, so that I have structured info for debugging.

## Implementation Decisions

### Process topology

- Three processes on one host: Hyper Sidecar (Node), Application Server (.NET), Jellyfin (external).
- Sidecar binds `127.0.0.1:4201` (default), App Server binds `127.0.0.1:8090` (default). No external network exposure. (ADR 0010, 0026, 0049.)
- App Server spawns Sidecar on startup; both die together. (ADR 0017.)
- Single Docker image contains all three plus the SPA. Multi-stage build. (ADR 0043.)

### Hyper Sidecar architecture (Node + NestJS)

- Mirror the C# App Server's Vertical Slices shape (`feature/<name>/{controller,module,dto}`) but skip Value Objects and Domain Events (the sidecar is an IO adapter, not a business core). (ADR 0044.)
- Three adapter layers, each with its own tests: `DriveRepository` (open/close Hyperdrives), `DriveIndexRepository` (persist UUID → metadata), `DriveRegistry` (in-memory mounted state). (ADR 0045.)
- `Corestore` lives at `<CINEREEL_DATA_DIR>/corestore/`. (ADR 0046.)
- HTTP Range handler is a NestJS controller delegating to `FileService.readStream`; hand-rolled `Range` parser. (ADR 0047.)
- Startup order is strict: CoreModules → `BootstrapService.onModuleInit` (load index, mount main + persisted drives, announce DHT) → HTTP listener bind. (ADR 0048.)
- Every endpoint requires `Authorization: Bearer <sidecar.token>`, including `/health` and `/v1/swagger.json`. (ADR 0049.)
- Remote drives (mounted by hex driveKey) are read-only mirrors; `FileService.write` and `deleteEntry` reject them. (ADR 0052.)
- All errors use RFC 9457 ProblemDetails with stable `type` URIs. (ADR 0051.)
- No SSE, WebSocket, or other long-lived connections in V1. App Server polls every 5s for BT progress. (ADR 0053.)
- Remote drive mounts are owned by the App Server; on Sidecar restart, the App Server re-mounts every subscribed drive. (ADR 0050.)

### Application Server architecture (.NET 10)

- Single `.csproj` (`apps/service/CineReel.Service.csproj`) with feature-namespace layout. (ADR 0025.)
- Vertical Slices: each feature has its own namespace with `Domain`, `Application`, `Infrastructure` sub-namespaces; feature events live in `Cinereel.<Feature>.Events`. (ADR 0025, 0041 mirror.)
- In-process `IDomainEventBus` only; Integration Events deferred to V2. (ADR 0025.)
- EF Core + SQLite (`<data-dir>/cinereel.db`); migrations auto-applied at startup. (ADR 0008, 0030.)
- Polly resilience pipeline on **read-only** Sidecar calls only (timeout, retry, circuit breaker). Write calls fail fast and let the event handler retry. (ADR 0039.)
- Logging via `Microsoft.Extensions.Logging` only — JSON to stdout, rotating file under `<data-dir>/logs/`. No Serilog. (ADR 0036.)
- Auth: HTTP-only cookie + SQLite `sessions` table, 30-day expiry, refresh-on-use. (ADR 0037.)
- RBAC: `[RequirePermission("publish:*")]` filter with wildcard matching. Permissions stored as JSON on the `accounts` row. (ADR 0038.)
- Error handling: exceptions only (`DomainValidationException` / `RecoverableException` / `NonRecoverableException`); ASP.NET Core `IExceptionHandler` maps to RFC 9457 ProblemDetails. (ADR 0032.)
- Health endpoint: required checks (Sidecar `/v1/health`, SQLite ping) drive HTTP status; optional checks (Jellyfin, BT engine, disk space) reported but don't trip 503. (ADR 0040.)
- No config hot reload. Restart-required. (ADR 0031.)
- No process / thread priority adjustment for BT. User handles system-wide. (ADR 0041.)
- EF Migrations auto-apply at startup; no rollback in V1. (ADR 0030.)
- App Server reads `appsettings.json` once. (ADR 0031.)
- Sidecar HTTP client generated by NSwag from `/v1/swagger.json`; CI forces regen. (ADR 0034.)

### Sidecar client generation

- NSwag generates `apps/service/src/Sidecar/SidecarClient.g.cs` from the running Sidecar's `/v1/swagger.json`. A hand-written `ISidecarClient` interface wraps the generated client and translates exceptions to `RecoverableException` / `NonRecoverableException`. (ADR 0034.)
- App Server checks `X-Cinereel-Version` on `/health` against its own version; mismatch fails startup. (ADR 0033.)

### Domain event semantics

- In-process bus dispatches handlers sequentially; publisher awaits completion. Nested `PublishAsync` calls execute after the current handler chain. (ADR 0035.)
- Handlers may throw `RecoverableException` (auto-retry up to 3 times with backoff 200ms / 1s / 5s) or `NonRecoverableException` (mark `failed`, no retry). All other exceptions skip retries and mark `failed`. (ADR 0027.)
- A background `FailedEntitySweeper : BackgroundService` re-runs failed entities every 60 seconds. (ADR 0027.)
- Handlers must be idempotent (enforced by code review and an automated test exercising each handler twice). (ADR 0027.)

### Subscription registry & metadata cache

- The `subscriptions` table holds `{ id, drive_key, type, status, created_at, last_scan_at, scope }`. (ADR 0008.)
- A `media_items` table holds `{ id, subscription_id, drive_key, path, imdb_id, local_id, type, status, nfo_path, poster_path, trailer_url, infohash, size_bytes }`. (ADR 0008.)
- IMDb IDs are required to be canonical (`tt\d{7,8}`); missing or invalid IDs become synthetic `local-<16hex>`. (ADR 0016.)
- Folder names use the canonical Jellyfin naming convention: `Movies/<Title> (<Year>) {imdb-<id>}/`. (ADR 0007.)
- Drive scope decisions use the drive's `descriptor.json` to determine what kind of drive it is. (ADR 0007.)

### BT (BitTorrent) engine

- Embedded MonoTorrent in the App Server process. (ADR 0011.)
- State machine: `Pending → Downloading → Completed → Seeding`. `Seeding → Stopped` on subscription cancellation or disk-pressure. `Failed → Pending` on manual retry. (ADR 0028.)
- Cinereel-Peer Seed is the default behavior: download completes → continue seeding indefinitely. (ADR 0003.)
- Subscription cancellation stops seeding and removes the Jellyfin folder. (ADR 0028.)
- Disk-pressure monitor (`DiskPressureMonitor : BackgroundService`) keeps only the 3 most recently accessed torrents seeding if free space drops below 5 GB. (ADR 0028.)
- `.torrent` files are auto-generated by MonoTorrent from a local video file; SHA-1 infohash, configurable piece size. (ADR 0011.)

### Jellyfin bridge

- Per-folder async lock keyed by `imdb-<id>` or `local-<hex>`; cross-folder concurrent. (ADR 0029.)
- Push writes: directory → `poster.jpg` → `movie.nfo` → (BT complete) `movie.mp4` → (optional) `trailer.mp4`. (ADR 0007.)
- Push is idempotent: existing files are not overwritten unless the source changed. (ADR 0020, 0029.)

### Trailer pipeline

- Trailer URLs are referenced from the resource drive's `descriptor.json` or discovered via IMDb-fallback metadata. (ADR 0015.)
- Trailers are streamed from the publisher's Hyperdrive via HTTP Range. (ADR 0006.)
- The App Server proxies trailer bytes to the SPA, with a 30-second cache for forward seeks. (ADR 0042 / implied by SPA codegen.)

### Web UI

- React 19 + Vite + TypeScript SPA served by the App Server from `apps/web/dist/` at the root. (ADR 0022.)
- Build pipeline runs `openapi-typescript` against the App Server's `/api/swagger.json` to generate types; hand-written `apiFetch<T>(path, init)` is the runtime call site. (ADR 0042.)
- Routes: `/movies`, `/subscriptions`, `/publish`, `/downloads`, `/profile`, `/jobs`, `/drive`. (Already present in `apps/web/src/features/`.)
- All API calls go through the App Server; the SPA never talks to the Sidecar directly.

### Auth flow (SPA ↔ App Server)

1. User opens `/` → SPA redirects to `/login` if no session.
2. User submits credentials → App Server verifies Argon2id hash → creates `sessions` row → returns `Set-Cookie: cinereel_session=...; HttpOnly; Secure; SameSite=Lax`.
3. Subsequent SPA calls use `credentials: 'same-origin'`; the App Server middleware reads the cookie and attaches `ClaimsPrincipal` with permission claims.
4. The `[RequirePermission("...")]` filter gates each endpoint. (ADR 0037, 0038.)

### Data directory layout

```
~/.cinereel/
├── cinereel.db                    # SQLite (App Server)
├── corestore/                     # Hyperdrive + Bee cores (Sidecar)
├── drive-index.json               # UUID → metadata (Sidecar)
├── sidecar.token                  # 32-byte hex shared secret
├── logs/
│   ├── cinereel.log
│   └── cinereel.2026-07-22.log
└── bt-staging/                    # Default BT download directory
```

### Deployment

- Single Docker image: `mcr.microsoft.com/dotnet/aspnet:10.0-noble` + Node 22 + multi-stage build. (ADR 0043.)
- Volume: `/data` → `~/.cinereel/`.
- Env: `CINEREEL_DATA_DIR=/data`, `SIDECAR_PORT=4201`, `Web__ListenPort=8090`.
- Dev mode: `pnpm dev` runs Sidecar + App Server + SPA via `concurrently`.

### Type / API contract flow

```
Sidecar /v1/swagger.json
       ↓ NSwag (build-time)
apps/service/src/Sidecar/SidecarClient.g.cs
       ↓ wrapped by
ISidecarClient (hand-written)
       ↓ consumed by
Sidecar-facing services in apps/service

App Server /api/swagger.json
       ↓ openapi-typescript (build-time)
apps/web/src/api/generated.d.ts
       ↓ consumed by
apiFetch<T>() in apps/web/src/api/fetcher.ts
```

The two codegen pipelines are independent but produce mutually-typed clients.

## Testing Decisions

### Single seam

The single seam for V1 e2e tests is the **App Server HTTP API** (`/api/*` endpoints). Web UI exercises the App Server the same way tests do. Sidecar and Jellyfin are mocked at the App Server boundary.

### What makes a good test

- Test **external behavior** (HTTP request → HTTP response), not internal implementation (which handler runs first, what the SQLite row looks like).
- Drive the API from both directions: happy path + every documented error code.
- Do not mock the database in V1; use a real SQLite file under a temp dir.
- For Sidecar calls, use the existing `InMemoryDriveRegistry` / `InMemoryDriveIndexRepository` / `InMemoryDriveRepository` test doubles — they already exist. (ADR 0044, 0045.)
- For Jellyfin calls, write a tiny in-process HTTP stub that records requests; assert on request bodies.

### Which modules are tested

- **App Server HTTP endpoints** (the seam). One test per endpoint, plus cross-cutting tests for auth + RBAC.
- **Domain event handlers** (unit tests, since they have retry semantics that are hard to drive through HTTP).
- **`BtScheduler` state machine** (unit tests, since the BT lifecycle has internal transitions).
- **`JellyfinPusher` lock semantics** (unit tests on a synthetic Media Item).
- **`FileService` Sidecar adapter** (unit tests via InMemory repository).

### Prior art in the codebase

- `apps/web/src/test/*.test.tsx` already exercises route components via Vitest + React Testing Library.
- Sidecar unit tests exist around `files.service.ts` and `drive-registry.ts` (under `apps/sidecar/src/services/` and `apps/sidecar/src/bootstrap/`).
- V1 adds: App Server unit + integration tests via xUnit + `WebApplicationFactory<Program>`.

### Out-of-scope for V1 testing

- BT swarm realism (use synthetic `.torrent` fixtures; do not download from public trackers in tests).
- Hyperdrive crypto (trust the SDK; we test our wrappers).
- End-to-end browser tests (Vitest covers logic; manual smoke for layout).

## Out of Scope

- Multi-node deployment (V2 introduces Integration Events, outbox, and broker).
- Cross-process push notifications (SSE / WebSocket deferred to V2).
- Discover / registry / search across nodes (V2 — manual drive-key entry is V1).
- Mobile and TV clients (V2).
- 2FA / TOTP (V2).
- Backward-compatible Sidecar versions (V1 ties Sidecar and App Server versions).
- Permission inheritance hierarchies beyond `*:wildcard` matching (V2 if needed).
- Multi-range HTTP responses (`multipart/byteranges`) — V1 rejects multi-range with 416.
- Push-to-multiple Jellyfin servers (V1 supports exactly one Jellyfin instance).
- Per-user Corestore or per-user resource drives (V1: one Corestore, all drives shared).
- Resource drive encryption at rest (V2).
- WebSocket / SSE BT progress (V2 — V1 polls every 5s).
- Profile Drive being writable by remote nodes (V1: Profile Drive is local-only).
- Subscription sharing across application accounts (V1: subscriptions are global per Cinereel install).

## Further Notes

- The terminology in `CONTEXT.md` is the project's source of truth. New words added during V1 implementation must be added there first, then used in code.
- All Cinereel data lives under one directory (`CINEREEL_DATA_DIR`). Backup procedures should `tar`/`rsync` that single directory.
- The Cinereel-Peer Seed behavior is **default on**. Operators who want to opt out of seeding must delete the subscription (ADR 0028 has no "download but don't seed" toggle in V1).
- App Server and Sidecar versions are tightly coupled (ADR 0033). Operators upgrading the App Server must also upgrade the Sidecar; the App Server's startup version check enforces this.
- Resource drive descriptors and the Hyperdrive metadata format are versioned implicitly by their JSON shape; the App Server logs a warning when it encounters an unknown `descriptor.type` (e.g. `music` arriving before music support ships) and skips the drive.
- All HTTP error responses use RFC 9457 ProblemDetails, both on the Sidecar and the App Server. The `type` URI is a stable identifier that operators can switch on.
- A future V2 SSE endpoint for BT progress would be additive; no V1 routes are deprecated.