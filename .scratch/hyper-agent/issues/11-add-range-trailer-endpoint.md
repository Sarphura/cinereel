# 11 — Add /v1/files/:driveKey/* Range endpoint (expand)

**What to build:** The Hyper Agent exposes a new Range-aware file streaming endpoint at `GET /v1/files/:driveKey/*` with ADR 0047 semantics. The existing `GET /v1/drives/:key/file?path=` read path remains live for one release cycle. The Range parser covers `bytes=A-B`, `bytes=A-`, `bytes=-N` and rejects multi-range with 416. Trailer bytes can now be range-streamed via the new path; the old path remains a fall-through.

**Blocked by:** 03 (path renamed)

**Status:** ready-for-agent

- [ ] `FilesController` is mounted at `/v1/files` and serves `:driveKey/*`
- [ ] `GET /v1/files/<driveKey>/<rest…>` with no `Range` header returns 200 + full body + `Content-Type` + `Accept-Ranges: bytes` + `Cache-Control: public, max-age=31536000, immutable`
- [ ] `GET /v1/files/<driveKey>/<rest…>` with `Range: bytes=A-B` returns 206 + sliced body + `Content-Range: bytes A-B/<size>` + `Content-Length: B-A+1`
- [ ] Multi-range requests return 416 with ProblemDetails `type: range-not-satisfiable` and `Content-Range: bytes */<size>`
- [ ] Unsatisfiable ranges return 416 with the same `type` URI
- [ ] Malformed `Range` returns 400 with `type: invalid-range`
- [ ] Drive-not-mounted and invalid-drive-key still resolve to their ProblemDetails URIs
- [ ] A dedicated Range-parser unit test file covers table-driven inputs: `bytes=0-499`, `bytes=500-`, `bytes=-500`, `bytes=0-499,1000-1499` (rejected), `bytes=` (malformed), missing (no Range)
- [ ] The existing `GET /v1/drives/:key/file?path=` read route is untouched
