# 18 — Two-process integration smoke test

**What to build:** The Hyper Agent + Application Server integration smoke test described in ADR 0021 is implemented as a runnable xUnit test. It boots the Hyper Agent as a child process pointing at a temp data dir, polls `/healthz` for readiness, performs the `/v1/version` check, boots the App Server against the Hyper Agent's loopback URL, runs the publish + subscribe happy path, asserts the App Server's `media_items` table reflects the subscribed drive, asserts the Jellyfin staging directory has the expected folder layout, and shuts both processes down. The test runs on merge to main and is fast (≤ 30 seconds) and idempotent.

**Blocked by:** 03, 09, 08, 10, 13, 14 (every behavior change must land first)

**Status:** ready-for-agent

- [ ] `tests/Cinereel.IntegrationTests/SmokeTests.cs` (or equivalent) implements the ADR 0021 sequence end-to-end
- [ ] The test boots both processes from their actual binaries (no in-process mocks for the integration seam)
- [ ] The test asserts a real media item row appears in the App Server's SQLite, the Jellyfin library staging has the expected folder, and the BT session reflects `pending` for the auto-packed `.torrent`
- [ ] The test runs in CI on merge to main, not on every PR (per ADR 0018)
- [ ] The test is idempotent: rerunning it on the same temp data dirs produces the same result
- [ ] The test completes in ≤ 30 seconds
- [ ] A failure leaves logs from both processes attached to the test report so an operator can debug without re-running
