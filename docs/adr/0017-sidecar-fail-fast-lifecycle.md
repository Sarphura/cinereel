# Application Server owns Sidecar lifecycle: spawn on startup, exit together on crash

The .NET Application Server (`apps/service`) is the single entry point. On its startup it spawns the Node Hyper Sidecar as a child process, waits for the Sidecar's HTTP `/health` endpoint to return 200 OK, then begins serving the Application Server's own HTTP surface. If the Sidecar child process exits unexpectedly (non-zero exit code, signal-killed), the Application Server itself logs the failure and exits with a non-zero code. The host system (systemd / launchd / docker / a CI orchestrator) is responsible for restart policy with appropriate backoff.

## Context

The single-launcher distribution model (grilling round 3, decision: "single-launcher") puts the Application Server at the top of the process tree. The Sidecar is a dependency, not a peer. The lifecycle question is what to do when the Sidecar dies.

Three plausible behaviors:

- **Auto-restart with backoff**: the App Server respawns the Sidecar indefinitely. Hides root-cause failures (corrupt Corestore, infinite crash loop).
- **Auto-restart with limit**: the App Server respawns up to N times, then gives up. Complex bookkeeping; the limit is arbitrary.
- **Fail-fast**: the App Server exits when the Sidecar exits unexpectedly. The host system handles restart.

## Decision

Fail-fast. Concretely:

1. **Startup**: the Application Server's `Program.cs` runs `node apps/sidecar/dist/main.js` (or equivalent) as a child process with stdin/stdout/stderr inherited. It captures stdout/stderr to the App Server's logger.
2. **Ready check**: the App Server polls `GET /health` on the Sidecar's loopback port (default `127.0.0.1:4201`) every 200ms up to 30 seconds. Once the Sidecar returns 200 OK, the App Server considers it ready and starts its own HTTP listener.
3. **Health monitoring**: every 30 seconds after startup, the App Server re-polls `/health`. If 3 consecutive polls fail, the App Server treats the Sidecar as crashed.
4. **Crash handling**: on detected crash, the App Server logs `FATAL: sidecar crashed, exit code <code>, stderr tail: ...` and exits with code `78` (`EX_CONFIG`).
5. **Clean shutdown**: when the App Server receives SIGTERM/SIGINT, it forwards the same signal to the Sidecar child, waits up to 5 seconds for graceful exit, then exits 0.

## Why fail-fast

- A Sidecar crash almost always means Corestore corruption, HyperDHT partition, or a hyper-sdk bug. Restarting the Sidecar rarely fixes the root cause; it just postpones the failure.
- The host system already has restart primitives (systemd's `Restart=on-failure` with `RestartSec`, launchd's `KeepAlive`, Docker's `restart: on-failure`, k8s' `restartPolicy`). These are well-tested.
- Fail-fast gives operators a clear failure signal — they see the App Server exit, they read the log, they fix the underlying issue.

## Trade-off accepted

- The Sidecar cannot survive a crash without going through the App Server. If the App Server is also broken, the operator has two layers to debug.
- `/health` polling is dumb and adds up to ~3 seconds of detection latency. Acceptable.
- The Sidecar's HTTP control port (ADR 0010) is bound to `127.0.0.1` — the App Server's loopback connection is safe.
