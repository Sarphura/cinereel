# 12 — App Server migrates all drive-file reads to /v1/files/:driveKey/*

**What to build:** The .NET Application Server's read paths that previously called `GET /v1/drives/:key/file?path=` for trailer bytes and any other ranged reads are migrated to the new `/v1/files/:driveKey/*` endpoint. The change is fully internal to the App Server's sidecar client; no Hyper Agent code changes. After this ticket, all ranged trailer reads go through the ADR-0047-shaped endpoint and the smoke test confirms trailer playback works end-to-end.

**Blocked by:** 11 (new endpoint must exist before any caller can use it)

**Status:** ready-for-agent

- [ ] Every read path in `apps/service` that previously used the `driveReadFile` OpenAPI operation now uses the new `filesRangeRead` (or equivalent) operation
- [ ] The generated NSwag client at this commit has both the old `driveReadFile` and the new range-read method; the App Server calls only the new one
- [ ] The smoke test (when it exists in ticket 18) confirms a trailer byte range is served end-to-end via the new endpoint
- [ ] No regression in poster / NFO / `.torrent` reads: those continue to use the existing `driveReadFile` (unchanged at this point)
