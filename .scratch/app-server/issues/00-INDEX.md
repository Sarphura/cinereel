# Application Server — Ticket Index

Source spec: `docs/spec/app-server.md` (Triage: `ready-for-agent`)

## Prefactors (no blockers)

- **01 — Value Objects + DomainValidationException**
- **02 — In-process Domain Event Bus**
- **06 — Expand IHyperAgentClient to full spec surface**
- **10 — ProblemDetails envelope + DomainExceptionHandler**
- **11 — Logging: MEL JSON stdout + rotating file + correlationId**
- **12 — Typed CinereelOptions + env-var precedence + startup validation**

## After 01

- **04 — EF Core DbContext, entities, InitialCreate migration** (Blocked by 01)
- **20 — NFO parser via XDocument** (Blocked by 01)

## After 02

- **03 — Handler exceptions + retry policy** (Blocked by 02)

## After 03 + 04

- **05 — Repository interfaces + InMemory implementations** (Blocked by 04)

## After 04 + 05 + 08

- **32 — FailedEntitySweeper + SessionExpirySweeper + Retry-now** (Blocked by 02, 03, 04, 05, 08)

## After 06

- **07 — Polly pipeline on IHyperAgentReadClient** (Blocked by 06)

## After 01 + 04 + 05

- **08 — Auth: Argon2id + AccountEntity + SessionAuthenticationMiddleware** (Blocked by 01, 04, 05)

## After 08

- **09 — RBAC: [RequirePermission] + PermissionMatcher** (Blocked by 08)

## After 01 + 04 + 05 + 06 + 08 + 09 + 10

- **17 — Account CRUD endpoints** (Blocked by 01, 04, 05, 08, 09, 10)

## After 01 + 02 + 04 + 05 + 06 + 09 + 10

- **18 — Subscriptions CRUD + state machine** (Blocked by 01, 02, 04, 05, 06, 09, 10)

## After 18

- **19 — Subscription recovery on Hyper Agent restart** (Blocked by 18)

## After 18 + 20 + 21

- **22 — Subscription scanning orchestrator** (Blocked by 18, 20, 21)

## After 20

- **21 — IMDb fallback tiers (TMDB + synthetic local ID)** (Blocked by 20)

## After 18 + 22

- **23 — Jellyfin pusher + cleaner** (Blocked by 18, 22)

## After 01 + 04 + 05 + 06 + 08 + 18

- **24 — Bootstrap admin + Demo drive** (Blocked by 01, 04, 05, 06, 08, 18)

## After 18

- **25 — BT scheduler lifecycle** (Blocked by 01, 18)
- **30 — Profile + avatar** (Blocked by 06, 18)
- **31 — Pub/sub flow endpoints** (Blocked by 18, 06)

## After 25

- **26 — BT bandwidth policy + DiskPressureMonitor** (Blocked by 25)

## After 06 + 25

- **27 — Trailer cache** (Blocked by 06, 25)

## After 04 + 06

- **28 — Search & poster wall (FTS5)** (Blocked by 04, 06)

## After 18 + 25

- **29 — Auto-Pack** (Blocked by 18, 25)

## After 04 + 07 + 12

- **16 — Lifecycle: EF migrations auto-apply on startup, version-check, structured shutdown** (Blocked by 04, 07, 12)

## After 07 + 04

- **15 — Health endpoint aggregator** (Blocked by 07, 04)

## After 10

- **13 — OpenAPI routing and dev UI** (Blocked by 10)

## After 12

- **14 — SPA host + static files + MapFallback** (Blocked by 12)

## After 13

- **34 — OpenAPI drift check + web codegen** (Blocked by 13)

## After 07, 18, 23, 25, 27, 30, 31 — call-site migration is safe

- **33 — Migrate Hyper Agent call sites to typed halves** (Blocked by 07, 18, 23, 25, 27, 30, 31)

## Final gate

- **35 — Two-process integration smoke test** (Blocked by 03, 04, 06, 08, 09, 10, 16, 18, 20, 22, 23, 24, 25)

## Dependency graph (text view)

```
01 ──┬─ 04 ──┬─ 05 ──┬─ 08 ──┬─ 09 ──┬─ 17
     │       │       │       │       │
     │       │       │       │       └─ 18 ──┬─ 19
     │       │       │       │              ├─ 22 ── 23
     │       │       │       │              ├─ 24
     │       │       │       │              ├─ 25 ── 26
     │       │       │       │              ├─ 29
     │       │       │       │              ├─ 30
     │       │       │       │              └─ 31
     │       │       │       └─ 32 ────────────────┐
     │       │       │                              │
     ├─ 20 ── 21 ── 22 ── 23                       │
     │                                             │
02 ── 03 ──────────────────────────────────────────┤
                                                   │
06 ── 07 ──┬─ 15                                   │
           ├─ 16 ──────────────────────────────────┤
           ├─ 27 ── 33 ─────────────────────────────┤
           └─ 30 ── 33 ─────────────────────────────┤
                                                   │
10 ── 13 ── 34 ────────────────────────────────────┤
                                                   │
12 ── 14 ── 16 ────────────────────────────────────┤
                                                   │
                                                   ▼
                                                  35
```

## Work order (linearised)

For a single agent working the frontier in dependency order:

**Critical-path prefactors:**
01 → 02 → 03 → 04 → 05 → 06 → 07 → 08 → 09 → 10 → 11 → 12

**After prefactors — features can fan out:**
13 (OpenAPI), 14 (SPA), 15 (Health), 16 (Lifecycle), 17 (Accounts), 18 (Subscriptions), 20 (NFO), 21 (IMDb), 22 (Scanning), 23 (Jellyfin), 24 (Bootstrap), 25 (BT), 26 (BT governance), 27 (Trailers), 28 (Search), 29 (Auto-Pack), 30 (Profile), 31 (Pub/sub), 32 (Sweepers), 33 (Call-site migration), 34 (Codegen), 35 (Smoke)

## Notes

- Tickets 01, 02, 06, 10, 11, 12 are independent prefactors and can run in parallel on day one. They have no internal dependencies.
- Ticket 04 (EF Core) is the longest single critical-path piece — every feature depends on it.
- Tickets 23 and 25 both depend on 18; they can be developed in parallel after 18 lands.
- Ticket 32 (FailedEntitySweeper) is reached once 08 lands, and runs in parallel with feature development from then on.
- Ticket 33 is the **contract freeze**: after it lands, every Hyper Agent call site uses the typed halves, and the union interface is test-only.
- Ticket 35 is the final acceptance gate. If 35 fails, every prior ticket must still hold green in isolation.
