# App Server spawns the Sidecar as a child process via `Process.Start("node", "main.js")` and waits on `/health`

The .NET Application Server launches the Hyper Sidecar as a child process during its own startup, waits for the Sidecar's `/health` to return 200, then proceeds with its own listener bind. On shutdown, the App Server sends SIGTERM to the Sidecar PID and waits up to 10 seconds before SIGKILL.

## Context

ADR 0017 mandated that App Server and Sidecar have linked lifecycle. ADR 0043 mandated a single Docker image. The remaining question is the exact mechanism by which App Server spawns Sidecar. Three plausible shapes:

- **App Server spawns child process** — `Process.Start` (or `System.Diagnostics.Process`), blocks startup until Sidecar `/health` is 200. Owns lifecycle.
- **External supervisor** — docker-compose / systemd / Kubernetes sidecar. Decouples. Requires the operator to handle ordering.
- **In-process Node host** — bundle the Sidecar into the App Server's process via a .NET hosted Node runtime. Complex and unnecessary.

## Decision

App Server spawns the Sidecar as a child process.

### Startup sequence

1. App Server reads `SIDECAR_BIN` (default: `node`) and `SIDECAR_ENTRY` (default: `/app/sidecar/main.js`) from env.
2. App Server writes a fresh `sidecar.token` to `<data-dir>/sidecar.token` (or reads existing one).
3. App Server calls `Process.Start("node", [entry], env: { SIDECAR_PORT, SIDECAR_DATA_DIR, SIDECAR_TOKEN_FILE })`.
4. App Server polls `http://127.0.0.1:<SIDECAR_PORT>/health` with `Authorization: Bearer <token>` every 250ms, up to 30 seconds.
5. On `/health` returning 200, App Server proceeds with version check (ADR 0033), then HTTP listener bind.
6. On `/health` not returning within 30s, App Server kills the Sidecar and exits 81.

### Sidecar stdout / stderr

Sidecar's stdout is inherited from the App Server process. The combined stream is captured by the App Server's logging pipeline as `SidecarProcessLogger` (subscribes to child's stdout/stderr via `OutputDataReceived`). Each line is prefixed with `[sidecar]` and forwarded to MEL (ADR 0036).

### Shutdown sequence

1. App Server receives SIGTERM (or Ctrl+C in dev).
2. App Server calls `_sidecarProcess.Kill(entireProcessTree: true)` (Windows) or sends SIGTERM to the PID (POSIX).
3. Sidecar receives SIGTERM, runs NestJS shutdown hooks (close drives, flush swarm, save drive-index), exits with code 0.
4. App Server waits up to 10 seconds for Sidecar to exit; if still running, sends SIGKILL.
5. App Server's own shutdown completes (close HTTP listener, close DB).

### Process tree on Windows

`Process.Kill(entireProcessTree: true)` is .NET 5+ feature. It kills child processes spawned by the Sidecar (Node.js + libuv). Required for graceful Windows shutdown.

### Process tree on POSIX

A simple `kill -TERM <pid>` is sufficient. Node.js forwards signals to libuv workers.

### Why not external supervisor

- Adds operator burden (Docker Compose `depends_on: condition: service_healthy`).
- Hard to test in CI (no supervisor available).
- Decouples lifecycle from the *one node = one process group* invariant.

### What's NOT in V1

- Restart-on-crash supervisor. (A crashed Sidecar takes the App Server down too — this is intentional.)
- Hot-reload of Sidecar binary. Restart of App Server is required.
- Separate stdout capture (Sidecar logs are mixed with App Server logs).

## Trade-off accepted

- The combined stdout makes Sidecar logs hard to filter in production, but operators using Docker / journald can grep `[sidecar]` prefix.
- A Sidecar crash kills the App Server. The user must restart manually. This is intentional — keeping a degraded UI when Sidecar is dead would cause silent data loss (e.g. writing metadata to a Jellyfin library whose subscription mount died).
- On macOS dev, `Process.Start` launches Node through `/usr/bin/env`, which works on every macOS version.