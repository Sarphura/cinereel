# Sidecar mirrors C# App Server's Vertical Slices shape but skips Value Objects and Domain Events

The Hyper Sidecar's NestJS layout is `feature/<name>/{controller,module,dto}` per feature — same shape as the .NET App Server's Vertical Slices (ADR 0020). Sidecar additionally mirrors the repository pattern with InMemory + concrete implementations for testability.

The Sidecar **does not** mirror two C# DDD primitives:

- **Value Objects** — TypeScript's `zod` validators at the controller boundary already enforce identity types (`driveKey: z.string().regex(/^[0-9a-f]{64}$/)`). Wrapping these in a `DriveKey` brand type adds little value.
- **Domain Events** — the hyper-sdk is already event-driven (`drive.on('append', ...)` etc.), and the NestJS app uses Node's `EventEmitter` internally where useful. Re-emitting events through a separate bus class is ceremony without payoff.

## Context

After C# App Server adopted Vertical Slices + Value Objects + Repository + Domain Events (ADR 0020), the question is whether Sidecar should mirror all of those DDD primitives. Three plausible shapes:

- **Full mirror** — Sidecar adopts Value Objects + Domain Events to match C# App Server exactly.
- **Shape only** — same folder layout (feature/* + controller + service), but no Value Objects or Domain Events.
- **Flatten** — drop the feature/* split, put everything in `src/`.

## Decision

Shape only.

### What is mirrored

- `feature/<name>/{controller,module,dto}` folder per business capability.
- `services/<name>.service.ts` per feature's domain service (lives in `services/` rather than per-feature; rationale below).
- `repositories/<name>.repository.ts` interface + `repositories/in-memory/<name>.in-memory.ts` test implementation.

### What is in `services/` (not per-feature)

The Sidecar's `services/` directory houses cross-feature domain services:

- `DriveService` — drive open / mount / unmount
- `FileService` — per-drive file IO
- `SwarmService` — DHT announce / peer connection

These are shared by all features, so they live outside the `feature/` tree. This is consistent with NestJS convention where cross-cutting services live above the feature tree.

### What is NOT mirrored

- **Value Objects** — Sidecar uses `zod` schemas (`src/infrastructure/types/`, `src/core/common/zod/schema-registry.ts`) for input validation. Types that show up in TS signatures are POJSO (`{ driveKey: string }`, not branded types).
- **Domain Events** — the hyper-sdk emits its own events; we directly subscribe via `drive.on(...)` where needed. No separate `IDomainEventBus`.
- **Aggregate boundaries / Bounded Context** — Sidecar is single-context.
- **Repository pattern + Interface**:  mirrored — this gives testability via InMemory swaps, which is high-value for the boundary between business logic and IO boundaries.

### Repository pattern

```typescript
// src/repositories/drive.repository.ts
export interface DriveRepository {
  openLocal(namespace: string): Promise<HyperdriveLike>
  openRemote(discoveryKey: string): Promise<HyperdriveLike>
  close(drive: HyperdriveLike): Promise<void>
}

// src/repositories/in-memory/in-memory-drive.repository.ts (test impl)
// src/repositories/hyperdrive.repository.ts (real impl)
```

Controllers depend on the interface; `BootstrapModule` wires the real impl in production and the in-memory impl in tests.

### Why this asymmetry is okay

The C# App Server hosts complex business rules (subscription merging, Jellyfin push orchestration, RBAC). Value Objects make those rules safer (no more passing strings where `DriveKey` is expected). Domain Events decouple handlers (Jellyfin pusher doesn't need to know about BT scheduler).

The Sidecar is essentially a thin protocol adapter over the hyper-sdk. The adapter logic doesn't have the same complexity profile. Forcing the same DDD primitives in adds ceremony without commensurate benefit.

If V2 introduces complex business logic in Sidecar (e.g. content-addressed deduplication), this decision is revisited.

## Trade-off accepted

- A reviewer familiar with the C# App Server may struggle to find the equivalent primitives in Sidecar. The ADR is the map.
- Feature folders are duplicated in spirit (`feature/drives` for controllers, `services/drives.service.ts` for the service, `repositories/drive.repository.ts` for the repo). A reader has to trace across three directories per feature. We accept this in exchange for the NestJS-native separation.