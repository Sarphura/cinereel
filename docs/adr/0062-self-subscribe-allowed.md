# Self-subscribe is allowed; the App Server does not block a node from mounting its own resource drives

When the App Server receives `POST /api/subscriptions` with a `drive_key` that resolves to the same node's `MAIN_NAMESPACE` or one of its own resource drives, the subscription proceeds normally. The publisher and subscriber happen to be the same node.

## Context

A node can publish resource drives (it owns them locally). The question is whether it can also subscribe to them. Three plausible shapes:

- **Allow self-subscribe** — `POST /api/subscriptions` accepts any driveKey, including the local node's own drives.
- **Disallow self-subscribe** — the App Server rejects a subscription whose driveKey matches a local drive.
- **Allow but warn** — same as allow, but the web UI shows a one-time warning.

## Decision

Allow self-subscribe.

### Why allow

- **Multi-device testing**: a user testing "two Cinereel nodes" can run both on one machine with two `CINEREEL_DATA_DIR` directories; one publishes, the other subscribes. From the second's perspective, the first is a remote node. Self-subscribe isn't an issue here because the data dirs differ.
- **Local development**: a developer testing the publisher→subscriber flow locally can subscribe to their own driveKey for end-to-end smoke testing.
- **Real multi-device case**: a publisher's NAS and their laptop are separate nodes — neither is "subscribing to itself". The publisher's own drive is mounted locally on the NAS for its own Jellyfin.

### What the App Server does

- No additional check at subscription time.
- The `subscriptions` row stores `drive_key` like any other subscription.
- The Sidecar's `mountRemoteDrive` call works the same way — it uses `sdk.getDrive(driveKey)` regardless of origin.
- The Sidecar's `DriveRegistry.isRemote` returns `true` for the locally-published drive (it's mounted by hex key, not by local namespace), which makes sense semantically — even from the same node, the publisher's view and the subscriber's view can differ if mounted by key.

### UI hint

- On the `/subscriptions` page, if the user subscribes to a drive whose `descriptor.ownerProfileKey` matches their own main drive's key, the row shows a small "(self)" badge.
- The badge is informational, not a warning.

### What's NOT in V1

- A "this drive is one of yours" filter on the explorer.
- Auto-mounting of own drives (the App Server already mounts local drives via the drive-index.json; this is separate from the subscription mechanism).

## Trade-off accepted

- A user who accidentally self-subscribes will see the same drive twice in their poster wall (once from local mount, once from "subscription"). The UI shows both with the `(self)` badge distinguishing them.
- The local-mount and the subscription are conceptually different: the local mount is the publisher's view (writable), the subscription is a read-only mirror (ADR 0052). A user with both has a read-only copy that's mostly redundant.