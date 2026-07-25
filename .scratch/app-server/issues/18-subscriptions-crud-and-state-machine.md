# 18 — Subscriptions: POST /api/subscriptions (driveKey or profileKey) + GET + DELETE + state machine

**What to build:** The subscription lifecycle (ADR 0013, spec §29–38). `POST /api/subscriptions` accepts `{ key: string, type: "drive" | "profile" }`; for `drive`, it calls `IHyperAgentWriteClient.MountRemoteDriveAsync(publicKey)` and stores the resulting `driveKey`. For `profile`, it first mounts the Profile Drive, reads `/profile.json`, lists the publisher's `collections[]`, and lets the user pick one (the picker is a second endpoint `POST /api/subscriptions/from-profile` accepting `{ profileKey, driveKey }`). The `subscriptions` row has `state ∈ { Pending, Active, Failed }` and `last_descriptor_seen_at`. `GET /api/subscriptions` lists every row. `DELETE /api/subscriptions/:id` unmounts via `IHyperAgentWriteClient.UnmountRemoteDriveAsync`, deletes the row, and cascades `media_items` and `torrent_files` rows. `SubscriptionCreated` and `SubscriptionDeleted` events fire on the bus (consumed by later feature tickets). Self-subscribe is allowed (ADR 0062); the row carries a `(self)` badge when `descriptor.ownerProfileKey == mainDriveKey`.

**Blocked by:** 01, 02, 04, 05, 06, 09, 10

**Status:** ready-for-agent

- [ ] `Features/Subscription/ISubscriptionService.cs` and `SubscriptionService.cs` with `CreateFromDriveKeyAsync`, `CreateFromProfileKeyAsync`, `ListAsync`, `GetAsync`, `DeleteAsync`, `MarkFailedAsync`, `MarkActiveAsync`
- [ ] `Features/Subscription/SubscriptionEndpoints.cs` registers `POST /api/subscriptions`, `GET /api/subscriptions`, `GET /api/subscriptions/:id`, `DELETE /api/subscriptions/:id`, `POST /api/subscriptions/from-profile`
- [ ] `Features/Subscription/Dto/SubscriptionResponse.cs`, `CreateSubscriptionRequest.cs`, `ProfilePickerResponse.cs`
- [ ] `SubscriptionCreated` event fires when the row is inserted; `SubscriptionDeleted` event fires when the row is deleted
- [ ] Self-subscribe detection: when `descriptor.ownerProfileKey` from `/v1/drives/:key/entry?path=/descriptor.json` matches the local main drive key, the response includes `isSelf: true`
- [ ] Error mapping: Hyper Agent `drive-not-mounted` → 404 `drive-not-mounted`; malformed `driveKey` → 400 `invalid-drive-key`; duplicate → 409 `duplicate-subscription`
- [ ] Unit tests with `InMemorySubscriptionRepository` and a fake `IHyperAgentReadClient` / `IHyperAgentWriteClient`: every state transition, every error mapping, self-subscribe detection
- [ ] Integration test: `WebApplicationFactory<Program>` with the bus wired, assert `SubscriptionCreated` is observed by a test handler
