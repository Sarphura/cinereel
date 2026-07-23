# Remote drives are read-only mirrors; local drives are writable; the boundary is enforced in FileService

The Hyper Sidecar distinguishes drives by *mount origin*, not by *current user role*:

- **Local drives** — opened via `sdk.getDrive(uuid)` where `uuid` is a string namespace under this Corestore's control. The publisher (Cinereel App Server on this node) has full read/write/delete authority.
- **Remote drives** — opened via `sdk.getDrive(driveKey)` where `driveKey` is the 64-hex public key of another node's drive. The local node has only read authority via DHT replication.

`FileService.write` and `FileService.deleteEntry` reject any operation on a drive whose `driveKey` is registered as remote (`DriveRegistry.isRemote(driveKey)`). Reads (`getEntry`, `getTree`, `readStream`) work for both.

## Context

After ADR 0003 fixed that Resource Drives are reference-metadata-only (no video bytes in the drive itself), the natural follow-up is whether a remote drive, mounted by a subscriber, can be written to. The answer is no — the publisher owns write authority; the subscriber is a passive consumer.

## Decision

Read-only mirrors. The boundary lives in `FileService`:

```typescript
// apps/sidecar/src/services/files.service.ts
async write(driveKey: string, path: string, body: Buffer, metadata?: unknown) {
  if (this.registry.isRemote(driveKey)) {
    throw new CannotWriteRemoteDriveError(driveKey)
  }
  // ... actual write ...
}

async deleteEntry(driveKey: string, path: string, recursive = false) {
  if (this.registry.isRemote(driveKey)) {
    throw new CannotWriteRemoteDriveError(driveKey)
  }
  // ... actual delete ...
}
```

`HttpExceptionFilter` (ADR 0051) maps `CannotWriteRemoteDriveError` to:

```json
{
  "type": "https://cinereel.dev/errors/cannot-write-remote-drive",
  "title": "cannot write remote drive",
  "status": 403,
  "detail": "driveKey <hex> was mounted as a remote read-only mirror; writes are rejected",
  "instance": "/v1/files/<hex>/..."
}
```

### What "remote" means in this context

A drive is "remote" if it was opened by 64-hex `driveKey` (rather than by local UUID namespace). The `DriveRegistry` carries this distinction.

A local drive is always opened by namespace. A publisher's *own* drive, opened locally to write to it, is local; the *same drive* opened by key on a subscriber node is remote.

### Why per-node, not per-role

- A drive has exactly one publisher (the node that owns the namespace).
- All other nodes are readers/subscribers.
- Implementing this as "publishers can write, subscribers cannot" requires a role concept per call site. Per-mount origin is simpler and correct.

### What's NOT in V1

- "I trust this remote drive enough to write back" — pushes are not a feature.
- RO drives that fail to update when the publisher publishes (a stale remote drives is shown but stale).
- Snapshotting a remote drive (read-only with a frozen-in-time semantic).

## Trade-off accepted

- If a publisher migrates their drive (closes the local drive and reopens it with a new UUID), the subscriber's view through `driveKey` continues working. Good.
- A node that runs both publisher and subscriber roles (e.g. a node that subscribes to its own drive as a sanity check) would see its own drive as remote, which is technically wrong but the user behaviour is testing-only.