# Sidecar HTTP control port is fixed (default 4201, override via env); App Server fails fast on conflict

The Hyper Sidecar's HTTP API listens on `127.0.0.1:4201` by default. The .NET Application Server reads `SIDECAR_PORT` (env var, default `4201`) and connects to that port. On startup, the App Server pre-checks that the port is free; if occupied, the App Server exits with a clear error rather than starting a second instance.

## Context

After ADR 0010 fixed the Sidecar's HTTP control surface to loopback and ADR 0017 set the Sidecar's lifecycle to "spawned by App Server, fails together", the remaining question is how the App Server discovers the Sidecar's port. Three plausible shapes:

- Fixed port (default 4201) with override — simple, debuggable, conflicts must be detected up front.
- Random port + sidecar.port file — zero-configuration, but adds a coordination layer and prevents easy debugging via curl.
- Unix socket — best isolation but Windows requires named-pipe workarounds.

## Decision

Fixed port. Concretely:

1. The Hyper Sidecar's `main.ts` reads `SIDECAR_PORT` (env, default `4201`) and binds its NestJS HTTP listener to `127.0.0.1:${SIDECAR_PORT}`.
2. The Application Server's `Program.cs` reads `SIDECAR_PORT` (same env, same default), spawns the Sidecar with the same env var set, and pre-checks the port via `IPGlobalProperties.GetActiveTcpListeners()` (or platform-appropriate call) before spawning.
3. If the port is already in use, the App Server logs `FATAL: port <port> already in use, is another Cinereel instance running?` and exits with code `73` (`EX_CANTCREAT`).
4. The shared-secret token file (`sidecar.token`, ADR 0010) lives next to the Sidecar's data dir at `<data-dir>/sidecar.token`. Both processes agree on `<data-dir>` via `CINEREEL_DATA_DIR` (env, default `~/.cinereel/`).

## Cross-platform note

- macOS / Linux: `IPGlobalProperties.GetActiveTcpListeners()` works directly.
- Windows: same API works; the App Server emits an additional warning if the port is in `TIME_WAIT` state because Windows recycling behaviour differs.

## Why fail-fast on port conflict

- A second Cinereel instance is almost always an accident (user double-clicked the launcher, systemd unit double-enabled).
- Allowing two instances corrupts SQLite, doubles seeding load, and confuses the user.
- The error message points the operator at the cause.

## Trade-off accepted

- The user cannot run two Cinereel instances on the same machine without explicit port overrides.
- A port in `TIME_WAIT` after a recent Cinereel crash could cause a 60-second startup delay on Windows. Acceptable; users re-launch rarely.
- The fixed port is a small "tell" to anyone on the same machine that Cinereel is running, but the loopback bind means they cannot connect anyway.