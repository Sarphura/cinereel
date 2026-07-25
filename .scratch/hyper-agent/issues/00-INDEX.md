# Hyper Agent — Ticket Index

Source spec: `docs/spec/hyper-agent.md` (Triage: `ready-for-agent`)

## Frontier (no blockers)

- **01 — Clone apps/sidecar into apps/hyper-agent (expand)**
- **04 — Sweep ADRs 0001-0063 to use "Hyper Agent" instead of "Sidecar"** (runs in parallel with 01–03)

## After 01

- **02 — Switch CI and App Server spawn to apps/hyper-agent** (Blocked by 01)

## After 02

- **03 — Delete apps/sidecar** (Blocked by 02)

## After 03 (controllers can be touched safely)

- **05 — Constants for Hyper Agent exit codes**
- **06 — Document startup contract in main.ts and README**
- **07 — Atomic writes for DriveIndex on every mutation**
- **08 — RFC 9457 ProblemDetails error envelope across all routes**
- **09 — Collapse auth to a single shared-secret bearer**
- **10 — /v1/version endpoint and Application Server version check**
- **11 — Add /v1/files/:driveKey/* Range endpoint (expand)**
- **15 — Boundary check script guards hyper-sdk imports repo-wide**

## After 11

- **12 — App Server migrates all drive-file reads to /v1/files/:driveKey/*** (Blocked by 11)

## After 12

- **13 — Delete the old /v1/drives/:key/file?path= read path (contract)** (Blocked by 12)

## After 05, 09, 10, 13 — contract is stable

- **14 — NSwag client generation and CI drift check** (Blocked by 09, 10, 13)

## After 05

- **16 — Operationalize exit codes as App Server fatal-error triggers** (Blocked by 05)

## After 10

- **17 — Remote-mount recovery after Hyper Agent restart** (Blocked by 10)

## Final gate

- **18 — Two-process integration smoke test** (Blocked by 03, 09, 08, 10, 13, 14)

## Dependency graph (text view)

```
01 ── 02 ── 03 ──┬─ 05 ── 16
                 ├─ 06
                 ├─ 07
                 ├─ 08 ──────────────────────────────┐
                 ├─ 09 ──┐                            │
                 ├─ 10 ──┼── 17                       │
                 ├─ 11 ── 12 ── 13 ──┐                │
                 └─ 15                ├─ 14 ──┐       │
                                       │       │       │
                                       │       ▼       │
                                       │      18 ◄─────┘
                                       ▼
                                      18
```

## Work order (linearised)

For a single agent working the frontier in order: 01 → 02 → 03 → 05 → 06 → 07 → 08 → 09 → 10 → 11 → 12 → 13 → 14 → 15 → 16 → 17 → 18. Tickets 04 and 15 are parallel-safe and can run alongside any other ticket.

## Notes

- The rename (01 → 02 → 03) is the only wide refactor that fans across the repository. Every subsequent ticket edits controllers under the new `apps/hyper-agent/` path only.
- Ticket 14 is the **contract freeze**. After 14 lands, any controller change that breaks the NSwag client fails CI on the drift check. Plan all subsequent behaviour changes against the client shape.
- Ticket 18 is the final acceptance gate. If 18 fails, the prior 17 tickets must still hold green in isolation.
