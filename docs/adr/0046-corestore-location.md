# Corestore data directory is `<CINEREEL_DATA_DIR>/corestore/`

The Hyper Agent's underlying hyper-sdk Corestore lives at `<CINEREEL_DATA_DIR>/corestore/`. `CINEREEL_DATA_DIR` defaults to `~/.cinereel/` and is configurable via the `CINEREEL_DATA_DIR` environment variable.

## Context

The hyper-sdk's Corestore is the SQLite-backed store that holds all Hyperdrive cores and Bee cores. Its location on disk affects:

- Backup/restore procedures (the user backs up everything under `CINEREEL_DATA_DIR`).
- Migration paths (moving to a new machine = move the data dir).
- Multiple-instance deployment (two Hyper Agents pointing at the same Corestore would conflict).

## Decision

`<CINEREEL_DATA_DIR>/corestore/`. The path is hard-coded into the SDK bootstrap:

```typescript
const sdk = await create({
  storage: path.join(configService.get('CINEREEL_DATA_DIR'), 'corestore'),
})
```

The `CINEREEL_DATA_DIR` is a single env var that controls all Cinereel data (App Server SQLite, Hyper Agent's Corestore, drive-index.json, logs). This gives the user one data directory to back up.

## Failure modes

- The directory doesn't exist or is unwritable: Hyper Agent exits 77 (`EX_DATAERR`) with a clear error.
- The directory is full: hyper-sdk writes will fail; Hyper Agent logs the failure and exits 78.
- Two Hyper Agents point at the same dir: SQLite locks; the second Hyper Agent fails to start.

## What's NOT in V1

- Custom Corestore paths per-drive. All drives share one Corestore.
- Per-user Corestores. Single node, single user.
- Corestore encryption at rest. V2 may add.
- Corestore garbage collection. SDK handles this internally per its own heuristics.

## Trade-off accepted

- All Cinereel data lives in one directory. Convenient for backup but means losing that directory loses everything.
- A user who wants to move data to a new disk must migrate the entire `CINEREEL_DATA_DIR`, not just the SQLite DB or just the Corestore.