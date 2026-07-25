# Hyper Agent HTTP Range parsing conforms to RFC 9110 in full

`GET /v1/drives/:key/file` parses the `Range` request header per RFC 9110 §14.1.2 (and the obsolete §14.16 semantics preserved for backward compatibility) and serves `multipart/byteranges` when the request asks for multiple ranges. This covers trailer preview use cases — including random-access seeking in `<video>` players, MP4 atom probing, and progressive download tools.

## Context

Earlier ADR 0005 declared that the Hyper Agent would implement HTTP Range "for trailers". A further grilling round established that the implementation must cover the full RFC, not a hand-rolled subset, because:

- MP4 demuxers probe arbitrary byte ranges (`moov` atom location requires seeking; players seek forward to load mid-roll chapters; transcoders read specific byte windows for fast start).
- Some CLI tools (curl, wget) issue `Range: bytes=-N` suffix requests against unknown-length endpoints.
- If we hand-roll a subset, future trailer endpoints or browser Range requests on cover images will surface subtle bugs.

## Decision

Implementations of the Hyper Agent's file route must:

- Parse `Range: bytes=A-B` (single closed)
- Parse `Range: bytes=A-` (single open-ended)
- Parse `Range: bytes=-N` (suffix)
- Parse `Range: bytes=A-B, C-D, ...` (multipart)
- Honor `If-Range: <etag>` / `If-Range: <http-date>` — return full body (200) if precondition fails, ranged body (206) otherwise
- Emit `Accept-Ranges: bytes` on every successful response (200 and 206)
- Emit `Content-Range: bytes A-B/Total` for single-range responses
- Emit `multipart/byteranges` for multi-range responses with a synthesized boundary and a `Content-Type: multipart/byteranges; boundary=<b>` header
- Return `416 Range Not Satisfiable` with a `Content-Range: bytes */Total` body when the requested range exceeds file size
- Emit `Content-Length` accurately for both single and multi-range responses

ETag is the SHA-256 of the drive's `(key, path)` tuple truncated to 16 hex chars — stable across replicas since both are deterministic. The Hyper Agent sets `ETag: "<16-hex>"` on every file response. `If-Range` with an ETag match serves the ranged body; mismatch returns the full body.

## Why not just `bytes=A-`

Open-ended only works for some clients but breaks MP4 demuxers and any tool that issues suffix ranges. Full RFC conformance removes all "we don't support that" failures on the boundary.

## Trade-off accepted

The implementation is more code (boundary generation, multi-range read coordination, ETag handling) and the multi-range path adds a buffer-reassemble step that limits maximum supported range count (capped at 16 concurrent ranges in a single request). This is acceptable because trailer use cases don't request many ranges, and even if they did, MP4 atom access typically requires only 2–4.
