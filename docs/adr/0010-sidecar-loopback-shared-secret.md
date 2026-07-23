# Sidecar binds its HTTP control port to loopback only, guarded by a shared secret

The Hyper Sidecar's HTTP API listens only on `127.0.0.1` (or a Unix domain socket on POSIX systems) and requires a Bearer token that the Sidecar generates at startup and writes to `<data-dir>/sidecar.token` (mode `0600`). The .NET Application Server reads that token on its own startup and uses it as a Bearer credential on every request to the Sidecar. The Sidecar's existing public Bearer-auth decorator is repurposed to validate this shared secret.

## Context

Two-process model (ADR 0002) means the Hyper Sidecar's HTTP API is no longer "the application's public surface" — it is an internal RPC between two processes on the same host. The original pre-decoupling design treated the Sidecar as a standalone service that might be called by anyone, and gated it with a single Bearer token issued by an admin. With C# Application Server as the only legitimate caller, the threat model collapses: the API is reachable only by another process on the same machine, and any such process is either the Application Server (legitimate) or something that shouldn't be there.

## Decision

The Sidecar's HTTP control surface binds to `127.0.0.1:<port>` (or Unix socket `/var/run/cinereel/sidecar.sock` on POSIX when `SIDECAR_SOCKET=unix`). On startup the Sidecar generates a 256-bit random token, writes it to `<data-dir>/sidecar.token` with mode `0600`, and includes it in the `Authorization: Bearer <token>` header validator that already wraps every controller route.

The Application Server, on startup, reads `<data-dir>/sidecar.token` (or accepts it via env var `SIDECAR_TOKEN` to support running as a different user) and adds it to every outgoing request to the Sidecar.

If the file is missing on the Application Server side, the App Server refuses to start. If the file's permissions are too open, the App Server emits a warning but continues.

The Sidecar's Hyperswarm UDP listener continues to bind publicly — that's the P2P layer and is unrelated to the HTTP control surface.

## Implications

- `apps/sidecar/src/feature/auth/` (existing bearer auth) continues to exist but its token source is now `<data-dir>/sidecar.token`, not an admin-configured value. The original "admin issues a token" flow is replaced by "Sidecar generates a token on startup".
- `apps/sidecar/src/main.ts` (or equivalent) must set the HTTP listener to `127.0.0.1`. The current Sidecar (under review during this grilling) was binding `0.0.0.0`; this must change.
- `apps/sidecar/.eslintrc.cjs` `no-restricted-imports` for Hyper-protocol modules remains as the **structural** boundary (ADR 0002). The token is the **network** boundary.

## Trade-off accepted

- The token in `<data-dir>/sidecar.token` is a shared secret on disk. Any process running as the same user can read it. That's acceptable because the only legitimate same-user process is the Application Server.
- Linux deployments may prefer Unix sockets for tighter namespace isolation. macOS has good support but Windows requires loopback TCP. The decision is local — the token is what matters cross-platform.
