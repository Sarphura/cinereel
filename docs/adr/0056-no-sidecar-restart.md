# App Server does not auto-restart a crashed Sidecar; the node exits and lets an external supervisor restart it

When the Sidecar child process exits (either cleanly or with a non-zero code) while the App Server is running, the App Server treats this as a fatal condition. The App Server:

1. Logs the Sidecar exit code and any captured stderr.
2. Sets its own exit code to the Sidecar's exit code (or 82 if unknown).
3. Calls `Environment.Exit(...)` after a 5-second shutdown grace period (to let in-flight HTTP requests finish).

External supervisor (systemd, Docker restart policy, Kubernetes pod restartPolicy, etc.) is responsible for restarting the whole node.

## Context

After ADR 0055 mandates App Server spawns Sidecar, the question is what happens when the Sidecar crashes. The candidate behaviors:

- **Don't restart** — exit the whole node, let the operator / supervisor handle it.
- **Restart once** — apply a single restart; if it fails again, exit.
- **Exponential backoff** — restart with increasing delay; cap after N attempts.

## Decision

Don't restart. Exit the whole node.

### Why this is the right shape

- The Sidecar's job is fundamental: drives, swarm, IO. If it's gone, the App Server is operating on stale state.
- Sidecar crashes are rare and indicate real bugs (not transient network blips). Each crash deserves a log entry an operator can investigate.
- A looping crash restart loop would burn CPU and log disk for no benefit.

### Supervisor guidance

Operators should configure:

- **Docker**: `restart: unless-stopped` (or `restart: on-failure:5` to cap restarts).
- **systemd**: `Restart=on-failure` with `RestartSec=10s`.
- **Kubernetes**: `restartPolicy: Always` is fine; readiness probes will mark the pod NotReady during restart.

### Recovery steps (operator)

1. Check the App Server's last log lines for `[sidecar]` prefix — the Sidecar's stderr was forwarded.
2. Verify `<data-dir>/corestore/` integrity (corrupted SQLite is the most common cause).
3. Verify disk space — full disk prevents Corestore writes.
4. Restart via the supervisor mechanism.

### Why not a single restart

- A single restart doesn't help if the Sidecar is crashing on init (bad config, missing drives, etc.).
- The complexity of "first crash → restart → second crash → exit" is the same as "first crash → exit". No benefit.

### What's NOT in V1

- A `SidecarSupervisor : BackgroundService` that handles restart with backoff.
- Crash dump collection (Core dumps on Node crash).
- Automatic corruption repair on Corestore startup.

## Trade-off accepted

- A Sidecar crash causes total downtime of the node until the operator intervenes.
- Operators running Cinereel as a long-lived service must set up a restart policy. Documented in README.