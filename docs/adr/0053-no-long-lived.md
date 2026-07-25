# V1 Hyper Agent exposes only request/response endpoints; no SSE, WebSocket, or other long-lived connections

The Hyper Agent's HTTP surface is exclusively request/response. Every endpoint returns its result synchronously (or fails fast). There is no Server-Sent Events, WebSocket, or other long-lived connection in V1.

## Context

After ADR 0017 made Hyper Agent fail-fast on errors, the question is whether Hyper Agent needs to maintain long-lived connections to push state to the App Server (e.g. BT progress, drive replication events, subscription scans). Three plausible shapes:

- **No long-lived** — App Server polls Hyper Agent on a schedule (5s for progress, on-demand for scans).
- **SSE for BT progress** — Hyper Agent pushes progress events as they change.
- **WebSocket for everything** — bidirectional; opens more advanced orchestration possibilities.

## Decision

No long-lived connections. Concretely:

### BT progress

`GET /v1/bt/torrents` returns the current state of every `TorrentManager` (paused, downloading, seeding, error). App Server polls this every 5 seconds when any torrent is active. The Hyper Agent doesn't push.

### Drive scans

App Server calls `GET /v1/drives/{key}` and `GET /v1/drives/{key}/tree` on demand (when subscription is created, periodically for re-scan). No push.

### DHT / replication events

Hyper Agent logs Hyperdrive events (`core.on('peer-add')`, etc.) for diagnostics but does not expose them via HTTP. App Server doesn't need real-time replication visibility.

### Why no SSE

- NestJS SSE works but adds runtime complexity.
- 5-second polling is acceptable for the user-facing latency Cinereel targets.
- SSE complicates the fail-fast lifecycle: a stuck SSE handler must be terminated separately from a normal HTTP request.
- Operators debugging via curl benefit from a uniform request/response surface.

### Why no WebSocket

- WebSocket is bidirectional; we have nothing to push *to* the Hyper Agent.
- WebSocket state must be tracked; one more thing to test.

### What's NOT in V1

- BT progress SSE.
- Drive replication push.
- Cross-process domain events (ADR 0025: V1 has only in-process events on the App Server).

## Trade-off accepted

- 5-second polling introduces up to 5s latency for "download progress visible in UI". Acceptable.
- Drive replication events are invisible until the App Server re-scans. The current re-scan cadence (default 5 minutes) is the de facto update interval. Acceptable.
- A future V2 SSE endpoint would be additive — no breaking changes to V1 routes.