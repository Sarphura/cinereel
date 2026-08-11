# 30 — Profile: GET/PUT /api/profile + avatar upload + collections[] = union of resource drives

**What to build:** The profile feature (spec §95–99). `IProfileService.GetAsync(ct)` reads `/profile.json` from the local main drive via `IHyperAgentReadClient.ReadFileAsync(mainDriveKey, "/profile.json")`. `IProfileService.UpdateAsync(profile, ct)` writes `/profile.json` via `IHyperAgentWriteClient.WriteFileAsync`. `POST /api/profile/avatar` accepts a multipart upload and writes `/avatar.<ext>`. The `collections[]` field is computed on every read by enumerating `descriptor.json` files on every resource drive the node publishes (via `IHyperAgentReadClient.GetTreeAsync` + `GetEntryAsync`). A profile update fires `ProfileUpdated`, which `ProfileAnnouncer` consumes to call `IHyperAgentWriteClient.AnnounceAsync(wait: true)` on every drive. Today the profile endpoint does not exist.

**Blocked by:** 06, 18

**Status:** ready-for-agent

- [ ] `Features/Profile/IProfileService.cs` interface and `ProfileService.cs` implementation
- [ ] `Features/Profile/ProfileEndpoints.cs` registers `GET /api/profile`, `PUT /api/profile`, `POST /api/profile/avatar`
- [ ] `Features/Profile/ProfileDto.cs` (`name`, `bio`, `avatarPath`, `updatedAt`, `collections[]`)
- [ ] `Features/Profile/ProfileAnnouncer.cs` `IDomainEventHandler<ProfileUpdated>` calling `IHyperAgentWriteClient.AnnounceAsync(wait: true)` on every local drive
- [ ] `Collections` recomputation: enumerate drives via `IHyperAgentReadClient.ListDrivesAsync`, for each drive with `type: "resource"` read `descriptor.json`, build `collections` row `{ driveKey, name, addedAt, updatedAt }`
- [ ] Avatar write: multipart upload saved to `/avatar.<ext>` (extension sniffed from content-type: jpg/png/webp)
- [ ] Validation: name length 1-64, bio length ≤ 1024, collections never manually writable (it's derived)
- [ ] Unit tests with fake `IHyperAgentReadClient` / `IHyperAgentWriteClient`: read returns parsed JSON, write round-trips, collections recomputed from drive list
- [ ] Integration test: update profile → assert `ProfileUpdated` event → assert announce is called
- [ ] `[RequirePermission("profile:write")]` on PUT and avatar endpoints; GET is open to any logged-in user
