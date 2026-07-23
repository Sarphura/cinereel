# `/health` aggregates required checks (Sidecar + SQLite) and reports optional checks without affecting overall status

The App Server exposes `GET /health` (and `GET /api/health` for the SPA). The endpoint returns a JSON object with two categories:

- **Required checks** — Sidecar `/v1/health` and SQLite `SELECT 1`. If either fails, HTTP 503; otherwise HTTP 200.
- **Optional checks** — Jellyfin reachability, MonoTorrent engine state, disk space, last subscription scan time. Reported in the JSON body but do not affect HTTP status.

```json
{
  "status": "healthy",
  "version": "0.4.3",
  "checks": {
    "sidecar": { "required": true, "status": "healthy", "latencyMs": 12 },
    "database": { "required": true, "status": "healthy", "latencyMs": 3 },
    "jellyfin": { "required": false, "status": "healthy", "latencyMs": 45 },
    "bt_engine": { "required": false, "status": "healthy", "active_torrents": 14 },
    "disk_space": { "required": false, "status": "healthy", "free_gb": 240 }
  }
}
```

## Context

Cinereel has multiple dependencies. A `/health` endpoint must help operators and end users answer "is the system working?" Three plausible scopes:

- **Required only** — Sidecar + SQLite. Fast and unambiguous. But ignores real-world issues (Jellyfin unreachable, disk full).
- **Required + Optional (aggregated)** — overall status follows the required checks; optional checks are reported but don't trip 503.
- **All required** — every dependency must be healthy. Too strict: a Jellyfin outage would mark the whole system unhealthy even though subscriptions still work.

## Decision

Required + Optional (aggregated).

### Implementation

```csharp
app.MapGet("/health", async (
    ISidecarReadClient sidecar,
    CinereelDbContext db,
    JellyfinHealthProbe jellyfinProbe,
    BtEngineHealthProbe btProbe,
    DiskSpaceProbe diskProbe) =>
{
    var required = new List<HealthCheckResult>();
    var optional = new List<HealthCheckResult>();

    try
    {
        var sw = Stopwatch.StartNew();
        await sidecar.GetHealthAsync();
        required.Add(new("sidecar", "healthy", sw.ElapsedMilliseconds));
    }
    catch (Exception ex)
    {
        required.Add(new("sidecar", "unhealthy", ex.Message));
    }

    try
    {
        var sw = Stopwatch.StartNew();
        await db.Database.ExecuteSqlRawAsync("SELECT 1");
        required.Add(new("database", "healthy", sw.ElapsedMilliseconds));
    }
    catch (Exception ex)
    {
        required.Add(new("database", "unhealthy", ex.Message));
    }

    optional.Add(await jellyfinProbe.CheckAsync());
    optional.Add(await btProbe.CheckAsync());
    optional.Add(diskProbe.Check());

    var overall = required.All(c => c.Status == "healthy") ? "healthy" : "unhealthy";
    return Results.Json(new { status = overall, version = BuildVersion, checks = required.Concat(optional) });
});
```

### Each probe's responsibility

- `JellyfinHealthProbe.CheckAsync()` — calls Jellyfin `/System/Info` with the configured API key. 5-second timeout.
- `BtEngineHealthProbe.CheckAsync()` — reads `BtEngine.State` (always available; reports `active_torrents` count).
- `DiskSpaceProbe.Check()` — `DriveInfo.AvailableFreeSpace` on the Jellyfin library root.

### Why required-only drives 503

- The two required checks are the actual functional dependencies.
- If Sidecar is unreachable, no Drive operations work.
- If SQLite is broken, no state can be persisted.
- Everything else can degrade gracefully.

### What's NOT in V1

- Liveness vs readiness probes (k8s-style).
- Prometheus-format `/metrics`.
- Per-check latency percentiles.
- Check-time caching (every `/health` call does the work fresh).

## Trade-off accepted

- `/health` performs 5 checks (2 required + 3 optional) every call. ~50ms typical. Acceptable.
- Optional checks can silently degrade without alerting. Operators must read the JSON body, not just the HTTP status. Documented.