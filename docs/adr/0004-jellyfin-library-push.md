# Jellyfin is the playback backend; metadata is pushed, video bytes are streamed through it

Jellyfin consumes Cinereel media items by reading NFO + poster files from a local library root that the .NET Application Server manages. Video bytes are not exposed by the Hyper Agent to Jellyfin directly — they arrive at Jellyfin via MonoTorrent's local staging directory, which Jellyfin scans as a normal media library path.

## Context

Grilling landed on a model where the Application Server is the only process that talks to both Jellyfin and the Hyper Agent. The Hyper Agent serves `.torrent` files and small metadata; the Application Server manages BT downloads through MonoTorrent; Jellyfin plays whatever sits in its library root.

## Decision

Jellyfin integration is "library push" only.

- The Application Server materializes NFO + poster + trailer files into a configured Jellyfin library root on the local filesystem.
- The Application Server also materializes the staged video bytes (downloaded via MonoTorrent) into the same root.
- Jellyfin's library scan picks up the new items; its normal HTTP Range streaming serves playback to clients.

The Hyper Agent exposes no Jellyfin-specific surface and Jellyfin runs unmodified.

## Why not a Jellyfin plugin

A plugin would let Cinereel register a virtual library source with Jellyfin, but it requires writing and maintaining C# against Jellyfin's internal plugin SDK, submitting to their plugin catalog, and tracking Jellyfin API breakage. The "library push" path uses only Jellyfin's standard local-library machinery, which is the most stable surface Jellyfin offers.

## Implications

- The Application Server owns a configured Jellyfin library root path (configurable, default `~/cinereel/jellyfin-staging/<library-name>/`).
- NFO + poster + trailer files written into this root must match Kodi naming conventions exactly so Jellyfin's built-in scanner picks them up.
- The Application Server must keep its staged files in sync with the latest state of each Media Item (rename on title change, delete on subscription removal, etc.).
- There is no Cinereel-specific Jellyfin plugin to ship or version against.

## Trade-off accepted

Jellyfin's library scan is somewhat slow and occasionally needs an explicit refresh trigger. We accept this rather than building a Jellyfin plugin. Library state is "eventually consistent" with the Application Server's metadata cache.
