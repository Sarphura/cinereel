# 16 — Lifecycles: EF Migrations auto-apply on startup, version-check after spawn, structured shutdown

**What to build:** The end-to-end startup + shutdown sequence (spec → Sequence at startup). `Program.cs` becomes the single composition root: configure services → register all features → spawn Hyper Agent → poll `/healthz` for 200 (≤30 s, exit 81 on timeout) → call `HyperAgentVersionProbe.EnsureAsync()` (exit 76 on mismatch) → run `dbContext.Database.MigrateAsync()` (exit non-zero on migration failure) → `app.Run()`. On `SIGTERM`/`SIGINT`: drain HTTP → stop `IBtScheduler` (when BT lands) → flush Jellyfin push state → close `CinereelDbContext` → forward SIGTERM to Hyper Agent (ADR 0055) → wait 10 s → escalate to SIGKILL → exit 0. Today `Program.cs` does only a partial handshake; the App Server does not own its own startup story.

**Blocked by:** 04, 07, 12

**Status:** ready-for-agent

- [ ] `Program.cs` orchestrates the documented 13-step startup sequence verbatim
- [ ] `Infrastructure/HyperAgent/HyperAgentReadinessWatcher.cs` polls `/healthz` every 250 ms up to 30 s; timeout exits 81
- [ ] `Infrastructure/HyperAgent/HyperAgentVersionProbe.EnsureAsync()` is invoked AFTER readiness and BEFORE migrations; mismatch logs both versions and exits 76
- [ ] `dbContext.Database.MigrateAsync()` runs AFTER the version check; failure logs the failing migration and exits non-zero
- [ ] `IHostApplicationLifetime.ApplicationStopping` registers a shutdown chain that drains HTTP, closes `CinereelDbContext`, forwards SIGTERM to the Hyper Agent child process, waits 10 s, escalates to SIGKILL
- [ ] Hyper Agent exits 0 (clean SIGTERM after `app.close()`) → App Server treats this as `CleanShutdown` per `HyperAgentExitCodePolicy` and proceeds to its own shutdown, NOT a fatal exit
- [ ] Hyper Agent exits with any non-zero code → App Server logs `[app-server] FATAL: hyper-agent exit <code>: <reason>` and exits with the mapped code per `HyperAgentExitCodes` (76, 77, 78, 79, 80, 81)
- [ ] `Features/Health/SelfHealthCheck.cs` (existing) renamed or moved to `Features/Health/SelfHealthCheck.cs` in the new feature folder layout
- [ ] Unit tests: `StartupSequenceTests.cs` uses `WebApplicationFactory<Program>` with mocked readiness and version responses; asserts exit codes for each failure mode
- [ ] Smoke test: run the binary against a temp data dir, observe the log sequence `[app-server] starting` → `[hyper-agent] listening` → `[hyper-agent] ready` → `[app-server] migrations applied` → `[app-server] listening on 127.0.0.1:8090`
