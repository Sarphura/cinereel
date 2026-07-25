# 17 — Remote-mount recovery after Hyper Agent restart

**What to build:** After the Hyper Agent restarts (whether from a crash, an upgrade, or a planned restart), the Application Server repopulates the Hyper Agent's remote-mount `DriveRegistry` by iterating its `subscriptions` table and calling `POST /v1/swarm/mount/:publicKey` for each entry. This codifies ADR 0050's recovery sequence as an automated recovery path, not a manual one. The App Server detects Hyper Agent readiness via `/healthz` and `/v1/version`, then runs the recovery.

**Blocked by:** 10 (version check is part of the readiness signal)

**Status:** ready-for-agent

- [ ] App Server exposes an internal "hyper agent recovered" event after `/healthz` returns 200 and `/v1/version` matches
- [ ] A `SubscriptionRecoveryService` listens for the event, reads active subscriptions from SQLite, and calls `POST /v1/swarm/mount/:publicKey` for each
- [ ] Recovery is idempotent: a subscription already mounted (e.g. due to a race) is a no-op
- [ ] Recovery failures are logged with the failing `driveKey` and surfaced as a non-fatal warning; the App Server does not crash if one drive fails to remount
- [ ] A unit test stubs the Hyper Agent client to return "drive-not-mounted" for one entry, then success for the next; asserts the loop continues
