# 10 — /v1/version endpoint and Application Server version check

**What to build:** The Hyper Agent exposes `GET /v1/version` returning its `package.json` version. The .NET Application Server's startup sequence reads `/v1/version` immediately after `/healthz` returns 200 and refuses to proceed if the strings differ. A version mismatch is a fatal startup error with both versions in the log and a clear exit code.

**Blocked by:** 03 (path renamed)

**Status:** ready-for-agent

- [ ] `GET /v1/version` returns `{ name: "hyper-agent", version: "<semver>" }` where the version string is read at runtime from the Hyper Agent's own `package.json`
- [ ] A supertest asserts the response body matches the value in `package.json`
- [ ] The Application Server's startup sequence reads `/v1/version` after `/healthz` and before binding its own listener; a mismatch exits 76 with a log line naming both versions
- [ ] A startup test (against a test app with version "9.9.9") proves the Application Server's check fires correctly when versions differ
- [ ] The Hyper Agent `/healthz` route remains as it is; the new route is additive
- [ ] No public API breakage: existing routes unchanged
