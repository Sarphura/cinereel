# Two-process architecture: .NET Application Server + Node Hyper Agent

The Cinereel node is split into two cooperating processes across a stable HTTP boundary. The Node Hyper Agent is the only process that touches Hyperdrive, Hyperswarm, Corestore, or `hyper-sdk`. The .NET Application Server owns the application domain — subscription registry, metadata cache, poster wall, search, Jellyfin bridge, and all MonoTorrent orchestration — and calls the Hyper Agent over HTTP for every drive operation.

## Context

Earlier design had a single NestJS process covering both Hyper-protocol plumbing and the application domain (publish / subscribe / movie / profile / poster wall). Grilling surfaced a series of decisions that collectively argued for a split:

- Video bytes live in BitTorrent swarms, not Hyperdrive. A MonoTorrent client must be embedded or hosted, and MonoTorrent is a .NET-native library.
- Jellyfin is the playback backend. The natural language for pushing metadata into a local Jellyfin library is .NET (Jellyfin itself is .NET).
- .NET gives us a first-class story for media metadata, search indexes, and downstream server work that is more cumbersome to express in NestJS.
- We agreed earlier (ADR 0001) not to switch to a protocol with a .NET SDK, so the Hyper-protocol layer must remain Node. Putting Hyper and the application domain in the same process would force the .NET parts to either shell out to Node or be re-implemented — both worse than a clean HTTP boundary.

## Decision

Two-process model.

- **Node Hyper Agent** (`apps/sidecar`): wraps `hyper-sdk`. Mounts drives, joins swarms, reads/writes files in drives, exposes drive and swarm operations over HTTP. Owns no application logic. Single boundary enforced by `apps/sidecar/.eslintrc.cjs` `no-restricted-imports`.
- **.NET Application Server** (new): owns subscription registry, metadata cache, poster wall, search, Jellyfin bridge, and MonoTorrent. Talks to the Hyper Agent over HTTP. Talks to Jellyfin over its own API. Hosts MonoTorrent as an embedded client.

## Boundaries

The Application Server must NOT:

- `import 'hypercore' / 'hyperdrive' / 'hyperswarm' / 'corestore' / 'hyper-sdk'`
- Open a Corestore
- Run its own Hyperswarm

The Hyper Agent must NOT:

- Touch MonoTorrent
- Talk to Jellyfin
- Own subscription tables, user state, or metadata caches

The Hyper Agent's HTTP API is the contract. It is generated via OpenAPI (NestJS Swagger already emits `/v1/swagger`) and consumed by the Application Server via a generated client.

## Capabilities routed through the Hyper Agent

Anything that reads or writes drive bytes, opens or closes a drive, or announces/joins a discovery topic goes through the hyper-agent's HTTP API. At minimum:

- `GET /v1/drives` — list mounted drives
- `POST /v1/drives` — create a local resource drive
- `DELETE /v1/drives/:key` — remove a mounted drive
- `POST /v1/swarm/mount/:publicKey` — mount a remote resource drive
- `POST /v1/swarm/unmount/:publicKey`
- `GET /v1/drives/:key/tree` — list drive contents
- `GET /v1/drives/:key/entry?path=...` — read a drive entry
- `GET /v1/drives/:key/file?path=...` — read a drive file (used for `.torrent` and small binary fetch)
- `GET /v1/swarm/identity` — own peer identity + main drive key
- `POST /v1/swarm/announce` — trigger an announce on demand

These already exist in `apps/sidecar/src/feature/`. The split does not require new hyper-agent endpoints yet.

## Capabilities owned by the .NET Application Server

- Subscription registry (which `driveKey`s the user has subscribed to, when, with what alias)
- Metadata cache (parsed NFO + poster URLs per Media Item, indexed for poster wall + search)
- Jellyfin push (writes NFO / poster files into Jellyfin's library root; registers library path)
- MonoTorrent session pool (one client per active playback; lifecycle tied to user actions)
- Cinereel-Peer Seed scheduler (re-seed finished downloads so publishers can go offline)
- Auto-Pack (given a local video file, generate a `.torrent` and stage descriptor + NFO + poster in a fresh resource drive via the Hyper Agent)
- Poster wall UI (the user-facing discovery layer)

## Trade-off accepted

Two processes, two storage layers, one extra HTTP hop per drive operation. The cost is real but bounded: the Hyper Agent is local-only (no remote callers), the OpenAPI contract is small and stable, and the alternative (a single Node process with MonoTorrent-as-a-service, or rewriting MonoTorrent-equivalent in Node) is worse.
