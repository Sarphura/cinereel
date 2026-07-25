# If Hyperdrive hole-punching fails, Cinereel fails the subscription loudly; no BT-tracker fallback in V1

When a subscriber mounts a publisher's resource drive and the hyper-sdk cannot establish peer connectivity (NAT traversal fails, both nodes are behind symmetric NATs, etc.), the Hyper Agent's `mountRemoteDrive` call times out or returns a peer-discovery error. The Application Server treats this as a hard failure:

- The subscription transitions to `Failed`.
- The web UI displays "could not connect to publisher".
- The user retries manually; there is no automatic fallback to a public BT tracker.

## Context

Hyperdrive uses Holepunch-style NAT traversal via Hyperswarm. If both peers are behind symmetric NATs, hole-punching fails and the drive is unreachable. Three plausible shapes:

- **Public BT tracker fallback** — also call out to public trackers (e.g. `tracker.openbittorrent.com`) using the infohash from the publisher's `.torrent` files. The subscriber's BT client fetches the metadata directly from trackers.
- **Fail loudly** — surface the failure, let the user retry or contact the publisher.
- **Wait for natural connectivity** — leave the subscription in `Connecting` state, hope for later connectivity.

## Decision

Fail loudly.

### Why not public tracker fallback

- The hyper-sdk's purpose is local-first P2P. Mixing public trackers violates that.
- Public trackers have their own availability and metadata-exposure risks.
- A user who can fetch from public trackers can also use any BT client directly — they don't need Cinereel.
- Adding a parallel public-tracker code path complicates the BT scheduler state machine (ADR 0028).

### Why not "wait for connectivity"

- The hyper-sdk already retries internally. If we wait longer than the SDK does, we're just adding latency before the user sees the failure.
- A subscription stuck in `Connecting` looks like a bug.

### What the user sees

- `subscriptions.status = "failed"` with `error = "could not establish peer connection"`.
- The poster wall does not show items from this subscription.
- A "Retry" button is available.
- The `media-items` table has `subscription_id` set but `status = "pending"`; nothing is queued for BT.

### What the publisher sees

- Nothing different. The publisher's drive is still mounted on their own node. The connectivity failure is on the subscriber's side.

### What's NOT in V1

- Public BT tracker fallback.
- DHT bootstrap via public trackers (the hyper-sdk has its own DHT).
- "Connect via known IP" — manual IP entry for cases where hole-punching consistently fails.

## Trade-off accepted

- A subscriber cannot subscribe to a publisher who is behind a symmetric NAT while they are behind a different symmetric NAT.
- A user with networking expertise can host the publisher's drive on a VPS that has port forwarding, then subscribe to that VPS from their home NAS. This is a documented workaround in the README.