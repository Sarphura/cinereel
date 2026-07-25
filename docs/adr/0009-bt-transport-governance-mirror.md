# BT transmission governance mirrors Hyper-side governance

The .NET Application Server's BT layer carries the same governance intent as the Hyper Agent's Hyperdrive governance (per-peer bandwidth throttling, connection-level rejection, anti-leech behaviour). The implementation differs — MonoTorrent has a global bandwidth setting and peer-level control must be wrapped — but the policy shape and accounting surface are consistent across both P2P layers.

## Context

The pre-existing `docs/06-transport-governance.md` covers only the Hyperdrive transport. After the Q11 decision to make BitTorrent the video-byte transport (ADR 0003), every Cinereel node now operates two P2P layers:

- **Hyperdrive (Node hyper-agent)** — drives metadata replication
- **BitTorrent (C# Application Server)** — video byte replication

A peer that abuses one layer will probably abuse the other. Allowing two completely separate governance surfaces invites inconsistency — different rate limits, different blacklist lists, different accounting. Mirroring the policy shape lets one set of decisions apply to both layers and keeps the user mental model unified.

## Decision

The .NET Application Server hosts a BT-side `BandwidthPolicy` and an anti-leech monitor. Both interfaces mirror the Hyper Agent's structure (peerKey-keyed throttling, connection-level rejection on bad behaviour).

### Bandwidth

MonoTorrent exposes `EngineSettings.MaxUploadSpeed` and `EngineSettings.MaxDownloadSpeed` as **global** caps. For per-torrent and per-peer limits:

- **Per-torrent rate**: configure `TorrentManagerSettings.MaxUploadSpeed` / `MaxDownloadSpeed` on each `TorrentManager` created for a Media Item.
- **Per-peer rate**: MonoTorrent does not expose per-peer limits directly. The Application Server wraps incoming peer connections via the MonoTorrent `IPeerConnectionListener` abstraction and inserts a throttling duplex stream per `(torrent, peer)` pair. This mirrors the Hyper Agent's `bandwidth.wrap(conn, peerKey)` pattern.

### Anti-leech

Behavioural triggers mirror the Hyper Agent's triggers (excessive download, repeated reconnect, occupied-but-not-working). The C# Application Server maintains a peer blacklist that also gets written into MonoTorrent's `engine.BannedPeers` collection so the BT client itself refuses to reconnect.

### Cross-layer blacklist propagation

A peer identity (Noise public key for Hyper, infohash+ip for BT) that earns a ban in one layer is mirrored to the other. The Application Server pushes Hyper-side bans into the Hyper Agent via `POST /v1/swarm/blacklist` (a new hyper-agent endpoint to add). The Hyper Agent pushes BT-side bans into the Application Server via an internal HTTP callback (a new App Server endpoint).

This keeps the same peer from being throttled on Hyper and then running unthrottled on BT.

## Why not "BT is public, no governance"

BT without rate limits lets a hostile peer pull the whole seeding library out of a node in minutes, exhausting upload bandwidth and starving other subscribers. The Cinereel-Peer Seed role (ADR 0003) makes the BT layer load-bearing for the entire subscription graph, so it deserves the same care as the Hyper layer.

## Trade-off accepted

- Implementing per-peer BT throttling requires custom MonoTorrent plumbing (`IPeerConnectionListener` + a throttling stream). This is non-trivial but is documented MonoTorrent extension territory.
- Cross-layer blacklist propagation adds two new HTTP endpoints (one on each side). Bounded surface.
- The two layers' "peer identity" keys are not the same (Noise PK vs BT infohash+ip). They cannot be unified; the cross-layer mirror is best-effort and tracked per-side.
