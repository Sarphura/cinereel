# V1 does not set process or I/O priority for BT; the user controls it system-wide

The .NET Application Server does not call `nice`, `ionice`, or any equivalent Windows API to adjust the priority of its MonoTorrent activity. BT engine operations run at the same OS priority as the rest of the App Server. Users who want to lower BT's priority adjust it system-wide (e.g. via systemd's `IOWeight`, cgroups v2's `io.weight`, or third-party tools on Windows).

## Context

A grilling question asked whether to `nice` the BT process. After reflection: V1's BT engine is hosted in-process within the App Server (ADR 0002). Adjusting the *process* priority would affect the entire App Server, not just BT — including HTTP request handling, DB writes, and UI serving. Adjusting *thread* priority via `Thread.Priority = BelowNormal` would similarly affect all I/O on that thread, not just BT.

Realistically, MonoTorrent's disk activity is mostly sequential writes to large files. It already yields to interactive workloads via the OS's natural elevator algorithm. There is no observed need for explicit priority adjustment in V1.

## Decision

No priority adjustment in V1.

### Why not `nice` the whole process

The App Server hosts:

- ASP.NET Core Kestrel (HTTP serving).
- EF Core (SQLite reads/writes).
- The Jellyfin push pipeline (file copies to the Jellyfin library root).
- The MonoTorrent BT engine (disk reads/writes for pieces).
- The Hyper Agent HTTP client (outbound calls).

`nice`ing the whole process would slow all five equally — the opposite of what we want (we want BT slow, others fast).

### Why not `Thread.Priority` for BT threads

- MonoTorrent uses the thread pool internally. Pinning priorities to specific thread pool tasks is fragile and brittle.
- Windows equivalent (`SetThreadPriority`) has similar issues.
- The marginal gain is small compared to the implementation cost.

### What users can do

- **Linux (systemd)**: set `IOWeight=10` in the cinereel service unit (cgroups v2). This affects only the App Server's I/O scheduling, not its CPU scheduling. BT is I/O-bound so this is the right lever.
- **macOS**: third-party tools like `AppTamer` can throttle specific apps' CPU/I/O.
- **Windows**: nothing built-in; users can use Process Lasso or similar.

### What's NOT in V1

- Process-level `nice`.
- `Thread.Priority` manipulation.
- `ionice` (Linux-specific).
- Per-torrent I/O quotas.

## Trade-off accepted

- A BT-heavy node may saturate disk I/O during seeding, slowing down SQLite writes and HTTP responses.
- Mitigation relies on the user being on a modern OS where the elevator algorithm already favors interactive workloads.
- V2 may add an opt-in "BT I/O throttle" feature that limits MonoTorrent's disk reads per second.