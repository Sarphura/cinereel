# 22 — Subscription scanning: SubscriptionScanningOrchestrator + descriptor-hash change detection + MediaItemAdded events

**What to build:** The end-to-end subscription scan (spec §55–59). `SubscriptionScanningOrchestrator` handles `SubscriptionCreated` (and `SubscriptionDescriptorChanged`) by walking the drive: read `/descriptor.json` via `IHyperAgentReadClient.GetEntryAsync` + `ReadFileAsync`, hash the descriptor body, compare it to the previously stored `media_items.descriptor_hash` values, and if changed or on the first scan, list the drive's top-level directory via `GetTreeAsync(prefix="/")`. For each directory containing `movie.nfo`, read the NFO via `FilesRangeReadAsync`, call `INfoParser.ParseAsync`, call `IIMDBResolver.ResolveAsync`, upsert a `media_items` row keyed by `(subscription_id, drive_path)` with the current descriptor hash, and emit `MediaItemAdded`. The scanner updates `subscriptions.last_descriptor_seen_at` with the successful read timestamp. It runs sequentially per subscription but in parallel across subscriptions. A descriptor-hash mismatch emits `SubscriptionDescriptorChanged`. Today nothing scans anything.

**Blocked by:** 18, 20, 21

**Status:** ready-for-agent

- [ ] `Features/Metadata/IMetadataScanner.cs` interface and `MetadataScanner.cs` implementation
- [ ] `Features/Metadata/SubscriptionScanningOrchestrator.cs` registered as `IDomainEventHandler<SubscriptionCreated>` and `IDomainEventHandler<SubscriptionDescriptorChanged>`
- [ ] `MetadataScanner.ScanAsync(subscriptionId, ct)` performs the walk + per-folder NFO parse + IMDb resolve + upsert
- [ ] `IMediaItemRepository.UpsertAsync(subscriptionId, drivePath, ...)` enforces the `UNIQUE(subscription_id, drive_path)` invariant from ADR 0008
- [ ] `DescriptorHashComputer` produces `sha256(descriptor.json body)`; every successful descriptor read stores it in `media_items.descriptor_hash` and updates `subscriptions.last_descriptor_seen_at` with the read timestamp
- [ ] Concurrency: per-subscription `SemaphoreSlim` keyed by `SubscriptionId`; the scanner awaits before re-entering the same subscription
- [ ] Unit tests: first-scan emits N events, re-scan with unchanged descriptor emits 0 events, descriptor change emits a `SubscriptionDescriptorChanged` and re-scans
- [ ] Integration test: `WebApplicationFactory<Program>` with a fake `IHyperAgentReadClient` returning a small drive fixture, assert `media_items` rows appear
