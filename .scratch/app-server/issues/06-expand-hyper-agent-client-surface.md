# 06 — Expand IHyperAgentClient surface to full spec (14 methods, read/write split, base adapter)

**What to build:** The hand-rolled `IHyperAgentClient` interface and `HyperAgentClient` class grow from today's 4 methods (`GetVersionAsync`, `HealthAsync`, `FilesRangeReadAsync`, `MountAsync`) to the full 14-method surface required by the feature tickets: `GetHealthAsync`, `GetVersionAsync`, `ListDrivesAsync`, `GetEntryAsync`, `GetTreeAsync`, `ReadFileAsync`, `WriteFileAsync`, `DeleteFileAsync`, `CreateDriveAsync`, `MountRemoteDriveAsync`, `UnmountRemoteDriveAsync`, `GetPeersAsync`, `AnnounceAsync`, `GetIdentityAsync`. The interface splits into `IHyperAgentReadClient` and `IHyperAgentWriteClient`; `IHyperAgentClient` extends both. The hand-rolled `HyperAgentClient` becomes a thin adapter over the existing NSwag-generated `Generated.HyperAgentClient` (already checked in). All four existing call sites keep their current signatures — this is the **expand** step of an expand–contract refactor; callers migrate in later tickets.

**Blocked by:** None — can start immediately (parallel with 01–05).

**Status:** ready-for-agent

- [ ] `Infrastructure/HyperAgent/IHyperAgentReadClient.cs` declares the 8 read methods
- [ ] `Infrastructure/HyperAgent/IHyperAgentWriteClient.cs` declares the 6 canonical write methods, including `CreateDriveAsync`; the union retains legacy `MountAsync` as the seventh write-side compatibility member during expand
- [ ] `Infrastructure/HyperAgent/IHyperAgentClient.cs` extends both (for tests that need the union)
- [ ] `Infrastructure/HyperAgent/HyperAgentClient.cs` implements all 14 by delegating to the NSwag-generated `Generated.HyperAgentClient` (or a hand-rolled equivalent if NSwag output is not yet complete)
- [ ] DTOs `DriveDescriptor`, `HyperdriveEntry`, `TreeNode`, `PeerInfo`, `IdentityInfo`, `MountResponse`, `UnmountResponse`, `AnnounceResponse`, `CreateDriveResponse` defined as records
- [ ] The existing 4 method signatures keep their current names and shapes so `HyperAgentVersionProbe`, `HyperAgentReadinessWatcher`, `SubscriptionRecoveryService`, and the trailer-range call site compile unchanged
- [ ] Unit tests against a fake `HttpMessageHandler` cover all 13 methods with happy-path + 5xx + invalid-drive-key (400) + drive-not-mounted (404)
- [ ] No behaviour change for any existing caller — old names keep working through the same `IHyperAgentClient` surface
