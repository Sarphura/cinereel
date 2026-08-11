# 19 — Subscription recovery: re-mount every persisted subscription after Hyper Agent restart

**What to build:** The post-restart recovery loop from the spec §39–42. The existing `SubscriptionRecoveryService` (currently in `Infrastructure/HyperAgent/`) moves to `Features/Subscription/`. On `HyperAgentRecoveredEvent` (raised by `HyperAgentReadinessWatcher` when both `/healthz` and `/v1/version` are green), it reads every `Subscription` from `ISubscriptionRepository`, calls `IHyperAgentWriteClient.MountRemoteDriveAsync` for each, marks `last_remounted_at` on success, and continues on failure (single drive failure does not stop the loop). A summary log line `[recovery] remounted X of Y subscription(s)` is emitted. The service must be idempotent — a subscription already mounted by the Hyper Agent is a no-op. Today the service is a stub reading from `InMemorySubscriptionStore`; this ticket migrates it to the new repository and the new Hyper Agent client.

**Blocked by:** 18

**Status:** ready-for-agent

- [ ] `Features/Subscription/SubscriptionRecoveryService.cs` consumes `ISubscriptionRepository` and `IHyperAgentWriteClient.MountRemoteDriveAsync`
- [ ] `HyperAgentReadinessWatcher` (ticket 16 lifecycle) raises `HyperAgentRecoveredEvent` when both readiness and version checks pass
- [ ] Per-subscription try/catch: `HyperAgentDriveNotMountedException`, `HyperAgentException`, and unexpected exceptions all log at warning level and let the loop continue
- [ ] `ISubscriptionRepository.MarkRemountedAsync(publicKey, at)` updates the row
- [ ] Idempotency: a `MountRemoteDriveAsync` call against an already-mounted drive succeeds (Hyper Agent returns 200, no duplicate row)
- [ ] Unit tests with fake repository + fake client: all-green recovery, mixed recovery (some succeed, some fail), empty-recovery (no subscriptions)
- [ ] Integration test: full lifecycle — kill Hyper Agent → restart → assert recovery happens within 30 seconds of readiness
- [ ] Existing `SubscriptionRecoveryServiceTests.cs` migrated; no behaviour change for the happy-path assertion
