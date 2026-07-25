# 15 — Health endpoint aggregator: GET /api/health with required + optional probes

**What to build:** The `GET /api/health` aggregator from ADR 0040. Required checks (drive 200/503): `IHyperAgentReadClient.GetHealthAsync` (via the resilient client) and SQLite `SELECT 1`. Optional checks (reported but never block 200): Jellyfin reachability via `JellyfinHealthProbe`, BT engine state via `BtEngineHealthProbe`, disk space on the Jellyfin library root via `DiskSpaceProbe`. Response shape: `{ status, version, checks: { hyper-agent, database, jellyfin, bt_engine, disk_space } }`. The endpoint runs all probes on every call (no caching). Today the App Server has only the trivial `SelfHealthCheck`; this ticket makes it real.

**Blocked by:** 07 (needs `IHyperAgentReadClient`), 04 (needs SQLite)

**Status:** ready-for-agent

- [ ] `Features/Health/IHealthProbe.cs` interface with `string Name`, `bool Required`, `Task<HealthCheckResult> CheckAsync(CancellationToken)`
- [ ] `Features/Health/HealthCheckResult.cs` record: `Name, Status, LatencyMs, Detail`
- [ ] `Features/Health/HealthAggregator.cs` runs required probes serially; optional probes in parallel; returns 200 when all required are healthy, 503 otherwise
- [ ] `Features/Health/HyperAgentProbe.cs` calls `IHyperAgentReadClient.GetHealthAsync`, logs latency
- [ ] `Features/Health/DatabaseProbe.cs` runs `dbContext.Database.ExecuteSqlRawAsync("SELECT 1")`
- [ ] `Features/Health/JellyfinHealthProbe.cs` calls `GET <Jellyfin:Url>/System/Info` with 5-second timeout (no-op when `Jellyfin:Url` is null)
- [ ] `Features/Health/BtEngineHealthProbe.cs` reads `IBtScheduler.ActiveTorrentCount` (interface stubbed here, implementation lands with BT ticket)
- [ ] `Features/Health/DiskSpaceProbe.cs` runs `DriveInfo.AvailableFreeSpace` on the Jellyfin library root
- [ ] `Features/Health/HealthEndpoints.cs` registers `GET /api/health` and the legacy `/health` alias
- [ ] Unit tests with fake probes: required-failure → 503, optional-failure → 200 with `status: degraded`, all-green → 200
- [ ] `HyperAgentProbe` injects the same `IHyperAgentReadClient` the rest of the app uses (the resilient / Polly-wrapped one), so the circuit breaker short-circuits when the Hyper Agent is down — `/api/health` reflects the break within the same 30-second window
