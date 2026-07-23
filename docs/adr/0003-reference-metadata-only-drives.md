# Reference-metadata-only resource drives; video bytes via BitTorrent

Resource Drives in Cinereel carry only reference metadata (NFO, poster, trailer, `.torrent` files). They do **not** carry video bytes. Video bytes are fetched on demand by the .NET Application Server via MonoTorrent, using the `.torrent` file that lives inside the Resource Drive.

## Context

The earlier model assumed Resource Drives would carry both metadata and video bytes — Hyperdrive replication would pull the whole movie. Grilling surfaced two reasons to change this:

1. **Storage duplication.** If a Resource Drive carries the video and the user is subscribed to many publishers, Hyperdrive replication multiplies the same video across many nodes. BitTorrent already solves this via swarms; layering Hyperdrive on top is redundant storage cost.
2. **Public BT ecosystem leverage.** Most well-curated media libraries already have BT swarms with strong seed ratios. Forcing publishers to re-host the video via Hyperdrive is pure friction. Letting them publish a `.torrent` (or letting the Application Server Auto-Pack one from a local file) and letting subscribers join the existing BT swarm is more sustainable.

## Decision

Resource Drives are reference-metadata-only. A Media Item folder is identified by the presence of **exactly one `.torrent` file** plus optional NFO + poster + trailer. The video bytes are never written into Hyperdrive.

## Implications

- `scanMovieFolder` rule simplifies to: a folder is a Media Item iff it contains a `.torrent` file. Older rules ("folder containing video files is a movie") are dropped.
- `Descriptor` does not need a `contentKind` field — every well-formed Resource Drive is reference-only by convention. Misuse (publishers dumping raw video into a drive) is silently tolerated; subscribers will never read those bytes because the Application Server only reads `.torrent` files.
- Sidecar's `GET /v1/drives/:key/file?path=...` becomes the primary way the Application Server retrieves `.torrent` bytes for MonoTorrent. No HTTP Range streaming of video bytes is needed — the sidecar's job ends at delivering the torrent file.

## Publishing flow

When a publisher adds a Media Item:

1. The Application Server receives a local video file path (or an existing `.torrent`).
2. If a local video file is given, the Application Server invokes MonoTorrent's torrent-creation API and a Cinereel-Peer Seed is started for the resulting `.torrent`.
3. The Application Server stages an NFO + poster + trailer for the item.
4. The Application Server calls the Hyper Sidecar to create a new resource drive and write `/descriptor.json`, the NFO, the poster, the trailer, and the `.torrent` file into it.
5. The Hyper Sidecar announces the new drive.

## Subscribing flow

When a subscriber mounts a Resource Drive:

1. The Hyper Sidecar mounts the remote drive and announces / joins the discovery topic.
2. The Application Server reads `/descriptor.json` via the sidecar and walks the drive tree, parsing NFO + collecting poster / trailer / `.torrent` references.
3. For each Media Item, the Application Server pulls the `.torrent` bytes through the sidecar and registers it in its metadata cache.
4. The Application Server pushes NFO + poster + the resolved video file path (via MonoTorrent's local staging) into Jellyfin's library.
5. When the user opens an item in Jellyfin, MonoTorrent streams the BT payload into the staging path Jellyfin is watching.

## Trade-off accepted

- Subscribers always need a working MonoTorrent client (the Application Server hosts it). If MonoTorrent is broken or blocked, no playback — but metadata discovery still works.
- Cinereel-Peer Seeds are required for new, non-public swarms. Without enough seeds, playback stalls. This is a known BT ecosystem risk and is mitigated by optional publication to public trackers.
