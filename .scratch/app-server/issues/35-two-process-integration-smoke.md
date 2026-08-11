# 35 — Two-process integration smoke test (App Server + real Hyper Agent child process)

**What to build:** The end-to-end smoke test from ADR 0021. Boots the Hyper Agent as a real child process (not a mock) pointing at a temp data dir, polls `/healthz` for readiness (≤ 30 s), then boots the App Server via `Process.Start("dotnet", "CineReel.Service.dll", env: { CINEREEL_DATA_DIR, SIDECAR_PORT, SIDECAR_TOKEN_FILE })`. The test subscribes to a known driveKey, waits for `media_items` rows to appear, asserts the Jellyfin staging directory contains the expected `<Title> (<Year>) {imdb-<id>}/` folder layout with `poster.jpg`, `movie.nfo`, `movie.torrent`. Asserts a `torrent_files` row exists with `bt_state = pending`. Asserts the SPA serves `index.html` at `/`. Shuts both processes down cleanly. The test runs in CI on every merge to `main` (per ADR 0018, not on every PR). Completes in ≤ 30 seconds. On failure, attaches both processes' logs to the test report.

**Blocked by:** 03, 04, 06, 08, 09, 10, 16, 18, 20, 22, 23, 24, 25 (every behaviour change must land first)

**Status:** ready-for-agent

- [ ] `apps/service/tests/Cinereel.IntegrationTests/TwoProcessSmokeTests.cs` implements the ADR 0021 sequence end-to-end
- [ ] The test boots both processes from their actual binaries (no in-process mocks for the integration seam)
- [ ] The test asserts a real `media_items` row appears in SQLite, the Jellyfin staging has the expected folder, and a `torrent_files` row has `bt_state = pending` for the auto-packed `.torrent`
- [ ] The test runs in CI on merge to `main`, not on every PR
- [ ] The test is idempotent: rerunning on the same temp data dirs produces the same result
- [ ] The test completes in ≤ 30 seconds
- [ ] A failure leaves logs from both processes attached to the test report so an operator can debug without re-running
- [ ] The existing `TwoProcessSmokeTests.cs` skeleton is replaced with the real implementation
