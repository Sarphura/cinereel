# Cinereel

A local-first, P2P-distributed media library platform. A single Cinereel node is one host the user controls; it publishes resource drives (carrying NFO / poster / trailers / `.torrent` files) over Hyperdrive and seeds video bytes over BitTorrent. Subscribers mount publishers' drives, browse a poster wall, fetch video on demand, and seed back. Playback runs through an external Jellyfin server.

## Architecture at a glance

```
┌──────────────────────────────────────────────────────────────────────────┐
│                Cinereel Node (single host, user-owned)                   │
│                                                                          │
│  ┌─────────────────────────┐         ┌──────────────────────────────┐    │
│  │ Application Server      │         │ Hyper Agent                 │    │
│  │ (apps/service, .NET 10) │  HTTP   │ (apps/hyper-agent, Node 22)│    │
│  │ - Subscription registry │ ◄─────► │ - hyper-sdk only             │    │
│  │ - Metadata cache        │  NSwag  │ - drive mount/unmount        │    │
│  │ - Search & poster wall  │ codegen │ - read NFO/poster/torrent    │    │
│  │ - Jellyfin bridge       │         │ - swarm announce/join        │    │
│  │ - MonoTorrent host      │         │                              │    │
│  │   (consume + seed)      │         │                              │    │
│  │ - Auto-pack .torrent    │         │                              │    │
│  │ - Trailer cache (1 GB)  │         │                              │    │
│  │ - Auth + RBAC           │         │                              │    │
│  └─────────────────────────┘         └──────────────────────────────┘    │
│              │                                      │                    │
└──────────────┼──────────────────────────────────────┼────────────────────┘
               │ (1) Metadata push to library         │ (2) Hyper protocol
               ▼                                      ▼
     ┌──────────────────┐                  ┌────────────────────────┐
     │ Jellyfin server  │                  │ Other Cinereel nodes   │
     │ (playback only)  │                  │ (via Hyperdrive swarm) │
     └──────────────────┘                  └────────────────────────┘
                                                       ▲
                                                       │ (3) BT swarm
                                                       ▼
                                          ┌────────────────────────┐
                                          │ MonoTorrent clients    │
                                          │ (consumers + replays)  │
                                          └────────────────────────┘
```

Three P2P networks coexist:

- **Hyperdrive** carries identity, profile, descriptors, NFO, posters, trailers, and `.torrent` files. Subscribers receive this automatically on mount.
- **BitTorrent** carries the video bytes themselves. `.torrent` files are referenced from Hyperdrive but the video content lives in BT swarms.
- **HTTP** between the Application Server and Jellyfin pushes metadata into Jellyfin's library.

## Process topology

- **Application Server** — .NET 10 process hosted at `apps/service` (revived from the legacy skeleton per ADR 0011). Owns the application domain: subscription registry, metadata cache, poster wall, Jellyfin bridge, MonoTorrent scheduler, torrent packaging, auth, RBAC. Talks to the Hyper Agent over loopback HTTP with a shared-secret token (NSwag-generated client). Hosts MonoTorrent as an embedded client. Default port `127.0.0.1:8090`. Also serves the SPA from `apps/web/dist/` at the root.
- **Hyper Agent** — Node 22 + NestJS process (`apps/hyper-agent`) that wraps `hyper-sdk`. Owns no business logic. Drive mount/unmount, swarm announce/join, file read/write over Hyperdrive. Default port `127.0.0.1:4201`. Spawned by the Application Server as a child process (ADR 0055). Linked lifecycle — if it dies, the Application Server exits (ADR 0017, 0056).
- **Jellyfin (external)** — the user's existing playback server. The Application Server pushes metadata into it; Cinereel does not host the transcode.

## Data directory

All Cinereel data lives under one directory, default `~/.cinereel/`, override via `CINEREEL_DATA_DIR`:

```
~/.cinereel/
├── cinereel.db                    # SQLite (Application Server)
├── corestore/                     # Hyperdrive + Bee cores (Hyper Agent)
├── drive-index.json               # UUID → drive metadata (Hyper Agent)
├── sidecar.token                  # 32-byte hex shared secret (Hyper Agent ↔ App Server)
├── bootstrap-admin.txt            # one-time admin password (operator deletes after first login)
├── bt-staging/                    # default BT download directory
├── trailers/                      # 1 GB LRU trailer cache
└── logs/
    ├── cinereel.log
    └── cinereel.<date>.log
```

## Lifecycle invariants

- App Server spawns Hyper Agent as a child process; both die together (ADR 0017, 0055).
- App Server verifies Hyper Agent `X-Cinereel-Version` matches before proceeding (ADR 0033).
- Hyper Agent bound to `127.0.0.1`; App Server also bound to `127.0.0.1` (ADR 0010, 0026).
- First startup: bootstrap admin account + an empty "Demo" resource drive (ADR 0063).
- Config precedence: env vars override `appsettings.json` (ADR 0059).
- No drive-count or storage limits; disk fills, the OS returns ENOSPC (ADR 0060).
- No BT-tracker fallback when Hyperdrive hole-punching fails — surface the failure (ADR 0061).

## Language

**Node**:
A running Cinereel instance — one Corestore + one Hyperswarm + one Application Server process. The unit of P2P presence.
_Avoid_: Instance, peer, server, client

**Hyper Agent**:
The Node + NestJS process (`apps/hyper-agent`) that wraps `hyper-sdk` and exposes drive and swarm operations over HTTP. Owns no business logic.
_Avoid_: backend, API, service

**Application Server**:
The .NET 10 process hosted at `apps/service` (revived from the legacy skeleton per ADR 0011) that owns the application domain — subscription registry, metadata cache, poster wall, search, Jellyfin bridge, MonoTorrent scheduler, and torrent packaging. Talks to the Hyper Agent over loopback HTTP with a shared-secret token. Talks to Jellyfin over its own API. Hosts MonoTorrent as an embedded client.
_Avoid_: orchestrator, frontend backend, NestJS service, legacy service

**Corestore**:
The Hyper Agent's on-disk SQLite-backed store for all Hyperdrive and Bee cores. Located at `<CINEREEL_DATA_DIR>/corestore/` (ADR 0046). One per node.
_Avoid_: db, store, database

**Hyper Agent Token**:
A 256-bit random hex string at `<CINEREEL_DATA_DIR>/sidecar.token` shared between Hyper Agent and Application Server for HTTP authentication (ADR 0010, 0049). Mode 0600. Auto-generated on first startup. The filename predates the rename to Hyper Agent and is intentionally preserved for backward compatibility.
_Avoid_: api key, secret, password

**Main Drive**:
The single Hyperdrive opened at startup under the fixed `main` namespace. Carries the node's public profile.
_Avoid_: profile drive, identity drive, root drive

**Profile Drive**:
An alternative name for the Main Drive that emphasizes its role as the carrier of public profile data (`/profile.json`, `/avatar.*`).
_Avoid_: personal drive, bio drive

**Resource Drive**:
A namespaced Hyperdrive used as a business library (movie / series / music / generic). Holds only **reference metadata** — NFO, poster, trailer, and `.torrent` files. Does **not** hold video bytes.
_Avoid_: collection, library drive, media drive, folder

**Drive Index**:
The node-local persisted registry in the Hyper Agent (`<CINEREEL_DATA_DIR>/drive-index.json`) mapping drive UUID → `{ name, type, createdAt }`. Source of truth for "what resource drives do I have mounted". Loaded once at Hyper Agent startup (ADR 0045, 0048).
_Avoid_: drive list, registry, store

**Mount**:
The act of opening a Hyperdrive (local or remote) and registering it in the in-memory `DriveRegistry`. Mounted drives are reachable through the Hyper Agent's HTTP file/tree APIs. Local mounts survive Hyper Agent restart via the Drive Index; remote mounts are re-mounted by the Application Server (ADR 0050).
_Avoid_: attach, bind

**Demo Drive**:
An empty resource drive named "Demo" with `descriptor.json` and no media items. Created automatically on first startup as a working target the user can browse, rename, or delete (ADR 0063).
_Avoid_: sample drive, example drive, starter drive

**Self-Subscribe**:
The act of a node subscribing to one of its own resource drives. Allowed; UI marks the row `(self)` (ADR 0062). Useful for testing and multi-device workflows.
_Avoid_: self-mount, local-subscription

**Library**:
The set of resource drives visible to a node — both locally published and subscribed. The unit users browse in the poster wall.
_Avoid_: catalog, archive, repository

**Publisher**:
A node that creates resource drives and announces them. May also operate as a MonoTorrent seed for the video bytes referenced by its drives.
_Avoid_: owner, sharer, uploader

**Subscriber**:
A node that mounts a publisher's resource drive by `driveKey` and consumes its metadata.
_Avoid_: follower, consumer, reader, leecher

**Subscription**:
The act of mounting a publisher's resource drive and persisting that mount in the Application Server's `subscriptions` SQLite table. Implies ongoing replication of metadata and a MonoTorrent session ready to fetch video bytes on demand.
_Avoid_: follow, watch, bookmark

**Descriptor**:
A JSON document at the root of every resource drive at `/descriptor.json` declaring `{ name, type, ownerProfileKey }`. The discovery anchor for any subscriber.
_Avoid_: manifest, metadata file

**Profile**:
A JSON document at `/profile.json` in the Main Drive holding `{ name, bio, avatarPath, updatedAt, collections[] }`. Plus optional binary avatar at `/avatar.*`.
_Avoid_: bio, about, card

**Collection**:
An entry inside `Profile.collections[]` referencing a resource drive the publisher surfaces publicly (`{ driveKey, name, addedAt, updatedAt }`).
_Avoid_: listed library, public folder

**Owner Profile**:
The Main Drive of the node that published a given resource drive. Reachable through `Descriptor.ownerProfileKey`.
_Avoid_: author, creator

**Reference Metadata**:
Everything a Resource Drive contains: NFO, poster, trailer, and `.torrent` files. The video bytes these reference live outside Hyperdrive, in BT swarms.
_Avoid_: payload, content, library contents

**Torrent File**:
A `.torrent` bencode file stored inside a Resource Drive. It points to a payload in a BT swarm. The seed metadata, not the video itself.
_Avoid_: magnet, tracker, manifest

**BT Payload**:
The video bytes — and any other large files — fetched via BitTorrent using a Torrent File. Never stored in Hyperdrive.
_Avoid_: media body, video blob, file payload

**Cinereel-Peer Seed**:
A Subscriber node that, after finishing a download, continues to seed the BT payload back into the swarm so other Subscribers can fetch. Replaces the Publisher as a seed once the Publisher goes offline. Default behavior (ADR 0003).
_Avoid_: mirror, cache, replica

**DriveKey**:
The hex-encoded public key of a Hyperdrive. The wire identifier for both Main Drives and Resource Drives.
_Avoid_: drive ID, address, fingerprint

**Discovery Key**:
A derived key from a DriveKey used by Hyperswarm for topic-based peer discovery. Never shared as an identity.
_Avoid_: topic, swarm key

**Holepunch**:
The Hyperswarm / Holepunch-style NAT-traversal mechanism by which two Hyperdrive nodes behind NATs establish direct peer connectivity. May fail under symmetric-NAT conditions; Cinereel surfaces the failure rather than falling back to public trackers (ADR 0061).
_Avoid_: NAT traversal, punching

**DHT Announce**:
The Hyper Agent's startup action of announcing each mounted drive's discovery key to the Hyperswarm DHT so peers can find this node. Best-effort; failure does not block startup (ADR 0048).
_Avoid_: publish, advertise

**Poster Wall**:
A user-facing browse view that renders one poster per Media Item across all mounted resource drives. Rendered by the Application Server and SPA; sourced from NFO and poster files in each drive.
_Avoid_: library grid, media grid, cover view

**NFO**:
A Kodi-style XML metadata file conventionally named `movie.nfo` next to a Media Item folder. The on-wire metadata source for movies. Parsed via `XDocument` (ADR 0012).
_Avoid_: info file, metadata XML

**Media Item**:
A single playable artifact in a resource drive — a folder containing exactly one `.torrent` file plus poster and NFO. No video bytes.
_Avoid_: title, asset, episode

**Stream Endpoint**:
A path produced by the Application Server that hands a `.torrent` (or its infohash) to MonoTorrent so that BT can deliver bytes on demand with seek support to Jellyfin.
_Avoid_: playback URL, download endpoint, file endpoint

**Trailer**:
An MP4 file at `/trailer.mp4` next to a Media Item in a publisher's resource drive. Streamed by the SPA via HTTP Range through the Hyper Agent. Cached locally by the Application Server with a 1 GB LRU cap (ADR 0054). Not auto-fetched from external APIs (ADR 0057).
_Avoid_: preview, sample

**Jellyfin Bridge**:
The component of the Application Server that pushes metadata (NFO / poster files / library structure) into a local Jellyfin server's library so Jellyfin can present and play the items. Idempotent (ADR 0029).
_Avoid_: Jellyfin plugin, Jellyfin API

**Auto-Pack**:
The Application Server's ability to take a local video file (typically >8 GB), generate a `.torrent` from it via MonoTorrent, and stage it for publication as part of a new resource drive.
_Avoid_: pack, bake, encode

**Application Account**:
An HTTP-layer identity used for panel access (admin / viewer). Orthogonal to the P2P Main Drive; one node has one Main Drive but may have multiple application accounts. Stored as Argon2id-hashed credentials in the Application Server's `accounts` SQLite table (ADR 0037).
_Avoid_: user, login, session

**Bootstrap Admin**:
The default `admin` account created on first startup. Password is generated randomly (16 chars) and written to `<CINEREEL_DATA_DIR>/bootstrap-admin.txt`. The operator must `rm` that file after first login (ADR 0063).
_Avoid_: default user, root account

**Permission**:
A wildcard string on an Application Account controlling access to one feature (`publish:create`, `subscriptions:read`, `*` for admin). Checked via `[RequirePermission]` filter on every controller (ADR 0038).
_Avoid_: role, scope, grant

**ProblemDetails**:
The RFC 9457 standard error response shape used by both the Hyper Agent and the Application Server. Stable `type` URIs (e.g. `https://cinereel.dev/errors/drive-not-mounted`) are switchable from client code (ADR 0032, 0051).
_Avoid_: error response, error body

## Architecture decisions

The Cinereel architecture is fixed by 64 ADRs in `docs/adr/`. Each ADR captures one decision in context. Newcomers should skim them in batches:

- **Hyper protocol + subscription semantics** (0001–0014)
- **Trailer fallback tiers + deployment + discover (V2)** (0015–0024)
- **App Server base architecture (Vertical Slices, EF, events, errors, auth, RBAC)** (0025–0042)
- **Docker, single image, health, version check, NSwag client** (0043)
- **Hyper Agent architecture (mirrors C# shape, adapter layers, range controller)** (0044–0053)
- **Operational details (spawn, cache, CI, config, bootstrap, first-time UX + openapi)** (0054–0064)
- **Naming** (0065)

If you are about to write code that may break one of these decisions, read the relevant ADR first. If the decision is wrong, write a new ADR that supersedes it — don't silently bypass.

## V1 spec

The complete V1 product specification (44 user stories, implementation decisions, testing seams, scope) lives at `docs/spec/v1-end-to-end.md`. It is the source of truth for "what V1 delivers" and is updated when the ADRs change in ways that affect user-facing behavior.

Subsystem specs decompose the V1 spec by component:

- **Hyper Agent** — `docs/spec/hyper-agent.md`. The Node process that owns Corestore, Hyperdrive, and Hyperswarm; HTTP contract; lifecycle; auth; errors.

## Further notes

- All HTTP error responses use RFC 9457 ProblemDetails, both on the Hyper Agent and the App Server. The `type` URI is a stable identifier that operators can switch on.
- The Hyper Agent and Application Server are tightly version-coupled (ADR 0033). Upgrading one requires upgrading the other.
- A future V2 SSE endpoint for BT progress, Integration Events, discover endpoint, and mobile/TV clients would be additive; no V1 routes are deprecated.
- The Hyper Agent is the only place that imports `hyper-sdk` directly. Application Server code accesses drives via `IHyperAgentClient` (NSwag-generated). This boundary is enforced by `scripts/check-sdk-boundary.sh`.
- Resource drive descriptors and the Hyperdrive metadata format are versioned implicitly by their JSON shape; the Application Server logs a warning when it encounters an unknown `descriptor.type` (e.g. `music` arriving before music support ships) and skips the drive.
- All HTTP Range handling follows RFC 9110 §14. Multi-range requests are rejected with 416 (ADR 0006).