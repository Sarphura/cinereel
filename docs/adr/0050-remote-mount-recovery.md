# Remote drive mounts are owned by the App Server; Sidecar remounts them on App Server signal after restart

After Sidecar restart, remote Hyperdrive mounts are re-established by the App Server, not restored from a Sidecar-local index. Specifically:

- The App Server's `subscriptions` table holds the canonical list of remote drives (`drive_key` columns).
- When the App Server starts (or after it loses contact with Sidecar), it iterates subscriptions and calls Sidecar's `POST /v1/drives/{driveKey}/mount` for each one.
- Sidecar's `DriveRegistry` is the only in-memory state for remote mounts; the disk does not persist them.

## Context

A Sidecar restart loses all in-memory `DriveRegistry` entries (ADR 0045, ADR 0048). After restart, the Sidecar's main drive and other locally-owned drives are remounted automatically from `drive-index.json`. Remote mounts, however, are not in any Sidecar-local index. The question is where to put that index.

Three plausible answers:

- **In `drive-index.json` with a new `type=remote` field** — Sidecar persists remote mounts alongside local ones.
- **Separate `remote-mount-index.json`** — Sidecar-specific persistent store.
- **App Server owns** — Sidecar is stateless w.r.t. remote mounts; App Server pushes mount requests after detecting Sidecar ready.

## Decision

App Server owns. The remote drive mount state lives in the App Server's `subscriptions` table. The Sidecar's only persistent indices are for local drives (the `MAIN_NAMESPACE` plus user-created resource drives).

### Recovery sequence

1. Sidecar exits (crash or graceful).
2. Sidecar restarts. `BootstrapService.onModuleInit` remounts the main drive and persisted local drives; DHT announces.
3. Sidecar's `/health` returns 200.
4. App Server's polling loop detects the new Sidecar ready.
5. App Server calls `GET /api/subscriptions/active` (own API), gets a list of remote `drive_key`s.
6. For each `drive_key`, App Server calls Sidecar's `POST /v1/drives/{driveKey}/mount`.
7. Sidecar's `DriveRegistry.remoteByKey` is repopulated.
8. Subsequent `GET /v1/subscriptions/{driveKey}` works normally.

### Why this is the right shape

- Single source of truth: subscriptions are in App Server SQLite. Trying to keep a Sidecar-side copy invites drift.
- The Sidecar remains stateless about remote drives — its `DriveRegistry.remoteByKey` is rebuildable from the App Server's subscription list.
- New subscriptions added by the App Server immediately mount the corresponding remote drive. Same code path as recovery.

### What's NOT in V1

- Push-from-App-Server subscription sync. (Currently the App Server already calls mount when a subscription is created; this ADR formalizes the same path during recovery.)
- Periodic subscription reconciliation (App Server re-mounting all remote drives on a schedule). V1 relies on recovery only.
- Multi-App-Server shared subscriptions (V1 is one App Server per Cinereel install).

## Trade-off accepted

- A user who uses Cinereel in offline mode (no subscribed remote drives) and manually opens remote drives via `openRemote` would lose those mounts on Sidecar restart. The fix is: don't expose `openRemote` to users; only the App Server calls it during subscription setup.
- If the App Server crashes too, the Sidecar ends up mountless on its own. Recovery becomes "App Server boots → calls Sidecar mount for each subscription". This is the same as step 6 above. Acceptable.
- A Sidecar running without an attached App Server (test mode, debugging) cannot remount remote drives — by design.