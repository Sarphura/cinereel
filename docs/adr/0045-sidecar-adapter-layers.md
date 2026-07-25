# Hyper Agent splits responsibilities: Repository interfaces own SDK access; DriveRegistry owns mount bookkeeping

The Hyper Agent's NestJS container wires three distinct concerns around the `hyper-sdk`:

- **`DriveRepository`** (`src/repositories/drive.repository.ts`) — opens / closes Hyperdrive instances via `sdk.getDrive()`. Two implementations: `HyperdriveRepository` (real) and `InMemoryDriveRepository` (tests).
- **`DriveIndexRepository`** (`src/repositories/drive-index.repository.ts`) — persists a UUID → driveKey index to disk so drives survive Hyper Agent restarts. `FileSystemDriveIndexRepository` (real), `InMemoryDriveIndexRepository` (tests).
- **`DriveRegistry`** (`src/bootstrap/drive-registry.ts`) — in-memory application state tracking which drives are currently mounted (local / remote), keyed by both UUID and hex `driveKey`. Not a repository: this is process state.

## Context

Hyper Agent work with Hyperdrives involves three kinds of knowledge:

1. How to ask the SDK to open a drive (`sdk.getDrive(uuid)`).
2. Where to remember which UUIDs exist (so drives are remounted on restart).
3. Which drives are mounted *right now* in this process — a runtime map.

These are often conflated (a single "DriveManager" handles all three). After reviewing the existing `bootstrap/drive-registry.ts` and `repositories/`, this ADR codifies the split as the V1 convention.

## Decision

### `DriveRepository` (Repository pattern)

```typescript
// src/repositories/drive.repository.ts
export interface DriveRepository {
  openLocal(uuid: string): Promise<HyperdriveLike>
  openRemote(driveKey: string): Promise<HyperdriveLike>
  close(drive: HyperdriveLike): Promise<void>
}
```

- `openLocal(uuid)` calls `sdk.getDrive(uuid)` where `uuid` is a string namespace.
- `openRemote(driveKey)` calls `sdk.getDrive(driveKey)` where `driveKey` is the 64-hex public key.
- `close()` releases SDK resources.

The real `HyperdriveRepository` wraps `hyper-sdk`. Tests use `InMemoryDriveRepository` which returns stub HyperdriveLike implementations.

### `DriveIndexRepository` (Repository pattern, persistent)

```typescript
// src/repositories/drive-index.repository.ts
export interface DriveIndexRepository {
  load(): Promise<void>
  entries(): Record<string, { name: string; type: 'metadata' | 'resource'; createdAt: string }>
  set(uuid: string, entry: IndexEntry): Promise<void>
  delete(uuid: string): Promise<void>
}
```

- Persists the "which UUIDs exist" set to disk.
- `FileSystemDriveIndexRepository` uses a JSON file under `<data-dir>/drive-index.json`.
- `InMemoryDriveIndexRepository` is a plain `Map` for tests.
- Loaded once at startup (`BootstrapService.onModuleInit`); saved on every mutation.

### `DriveRegistry` (in-memory application state)

```typescript
// src/bootstrap/drive-registry.ts
export interface DriveRegistry {
  byKey(driveKey: string): HyperdriveLike | null       // local OR remote
  byNamespace(uuid: string): HyperdriveLike | null      // local only
  isRemote(driveKey: string): boolean                   // was opened by driveKey, not uuid
  listLocal(): Array<{ uuid: string; driveKey: string }>
  closeRemote(driveKey: string): Promise<void>
  rememberLocal(uuid: string, drive: HyperdriveLike): void
  rememberRemote(driveKey: string, drive: HyperdriveLike): void
  forgetLocal(uuid: string): void
}
```

- Three in-memory `Map`s: `localByUuid`, `localByKey`, `remoteByKey`.
- **Not** a Repository: this is process state, not data-access. It belongs in `bootstrap/` (composition layer), not `repositories/`.
- Cleared on process restart; rebuilt from `DriveIndexRepository` + `DriveRepository.openLocal()` calls during `BootstrapService.onModuleInit`.

### Hivepunch / Hyperswarm access

Hyperswarm and Holepunch access is encapsulated in `HyperdriveSwarmRepository`:

```typescript
export interface PeerConnectionRepository {
  announce(discoveryKeys: string[]): Promise<void>
  unannounce(discoveryKeys: string[]): Promise<void>
  listConnected(): string[]
}
```

- `HyperdriveSwarmRepository` wraps `sdk.connections`.
- `BootstrapService.onModuleInit` calls `swarmService.announce(true)` once to seed the DHT.

### Why three layers, not one

- **Testability**: an InMemoryDriveRegistry is trivial to construct in tests; replacing the real registry with the in-memory one is one DI override.
- **Restart semantics**: DriveIndexRepository is durable; DriveRegistry is ephemeral; this matches the conceptual split (one survives crashes, the other doesn't).
- **Side-effect boundaries**: swarming is a side-effect that may fail without breaking core operations. Putting it behind its own repository means the failure can be reported on its own.

## What's NOT in V1

- A unified "DriveManager" class that does all three. The split is intentional.
- Persistent remote-mount registry. Restart loses remote mounts, and remounting happens lazily on next read.
- A versioned drive-index format. JSON file format is the V1 choice; V2 may switch to SQLite or a richer schema.

## Trade-off accepted

- Three layers means readers must trace through `DriveRepository` → `DriveIndexRepository` → `DriveRegistry`. The benefit is clean test boundaries.
- `DriveRegistry` does double-duty for local and remote maps. A future split (`LocalMountRegistry` + `RemoteMountRegistry`) is acceptable but not now.