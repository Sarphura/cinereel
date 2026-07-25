# Hyper Agent exposes HTTP Range streaming, but only for small drive-resident media

The Hyper Agent's `GET /v1/drives/:key/file` endpoint implements HTTP Range requests. In the reference-metadata-only model (ADR 0003), the only content that flows through this endpoint with byte-range semantics is **trailer files** stored inside Resource Drives. The Hyper Agent must not be used to stream video bytes — video bytes arrive at Jellyfin via MonoTorrent's local staging.

## Context

Trailers are typically small MP4 files (a few MB to a few hundred MB) that publishers include next to Media Items to give subscribers a quick preview without committing to a full BT fetch. Storing the trailer as another `.torrent` (and routing preview through MonoTorrent) was an option; grilling chose HTTP Range on the Hyper Agent instead, because trailers are small enough to live in Hyperdrive and reading them straight from the mounted drive avoids unnecessary BT session spin-up.

## Decision

The Hyper Agent's `GET /v1/drives/:key/file?path=...` route:

- Implements HTTP Range request parsing (`Range: bytes=start-end`)
- Sets `Accept-Ranges: bytes` on every response
- Returns `206 Partial Content` for ranged requests with a `Content-Range` header
- Returns `200 OK` with full body for non-ranged requests
- Streams bytes through Hyperdrive's `createReadStream(path, { start, end })`, which Hyperdrive / Hyperblobs support natively

Trailers are the canonical consumer. The Application Server requests trailers via this endpoint to power previews in the poster wall UI.

## Why this is bounded

Video bytes never flow through this endpoint. They go through MonoTorrent and land in Jellyfin's library root. The Hyper Agent's Range streaming capability exists for one purpose only: trailers. This keeps the Hyper Agent's media-streaming surface tiny and easy to reason about — there's no temptation to route video bytes through it "for performance" later.

## Implementation note

Hyperdrive's `createReadStream(path, opts)` passes `opts` directly to Hyperblobs' `createReadStream`, which natively supports `start` and `end` byte ranges. The Hyper Agent's current implementation (in `apps/sidecar/src/services/files.service.ts`) uses generic `options?: Record<string, unknown>` for `createReadStream`, which already permits forwarding `start` / `end`. The new work is in the controller layer: parse the Range header, translate it to `{ start, end }`, set the response headers, and return `StreamableFile`.
