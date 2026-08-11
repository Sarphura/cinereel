# 31 — Pub/sub flow: POST /api/publish/drives, DELETE, announce, GET swarm peers, GET identity

**What to build:** The publish-and-swarm surface (spec §100–104). `IPublishService.CreateDriveAsync(name, type, ct)` calls `IHyperAgentWriteClient.CreateDriveAsync(name, type)` and writes `descriptor.json` with `ownerProfileKey = mainDriveKey`. `IPublishService.DeleteDriveAsync(driveKey, ct)` calls `UnmountRemoteDriveAsync`, removes from `subscriptions` (cascade). `IPublishService.AnnounceAsync(driveKey, wait, ct)` calls `IHyperAgentWriteClient.AnnounceAsync`. `GET /api/swarm/peers` returns `IHyperAgentReadClient.GetPeersAsync()`. `GET /api/identity` returns `IHyperAgentReadClient.GetIdentityAsync()`. The endpoints are gated by `[RequirePermission("publish:*")]` (write) and `[RequirePermission("library:read")]` (read). Today only the `Subscriptions` CRUD exists; nothing publishes or surfaces swarm state.

**Blocked by:** 18, 06

**Status:** ready-for-agent

- [ ] `Features/Publish/IPublishService.cs` interface and `PublishService.cs` implementation
- [ ] `Features/Publish/PublishEndpoints.cs` registers `POST /api/publish/drives`, `DELETE /api/publish/drives/:key`, `POST /api/publish/drives/:key/announce`, `GET /api/swarm/peers`, `GET /api/identity`
- [ ] `Features/Publish/Dto/CreateDriveRequest.cs`, `CreateDriveResponse.cs`, `PeerInfoResponse.cs`, `IdentityResponse.cs`
- [ ] On `POST /api/publish/drives`: validate `name` length 1-64, `type ∈ { metadata, resource, blob }`; on success, return `DriveDescriptor` and insert a `subscriptions` row pointing at the new drive
- [ ] On `DELETE /api/publish/drives/:key`: refuse if `:key` is the main drive key (403 `cannot-delete-main-drive`); else unmount + cascade
- [ ] On `POST /api/publish/drives/:key/announce`: accept `{ wait: bool }` body; forward to `IHyperAgentWriteClient.AnnounceAsync(discoveryKey, wait)`
- [ ] `GET /api/swarm/peers` response: `{ peers: [{ publicKey, connectedAt, remoteAddress }] }`
- [ ] `GET /api/identity` response: `{ mainDriveKey, peerPublicKey, swarmPort, peerCount }`
- [ ] Unit tests with fake `IHyperAgentWriteClient` / `IHyperAgentReadClient`: every CRUD path + every error mapping
- [ ] Integration test: create → announce → delete cascade verified via `ISubscriptionRepository`
- [ ] Self-subscribe detection lives in ticket 18; this ticket reads `mainDriveKey` from `IIdentityService` for the `descriptor.json.ownerProfileKey` field
