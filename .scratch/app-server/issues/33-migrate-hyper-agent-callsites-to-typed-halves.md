# 33 — Migrate Hyper Agent call sites from hand-rolled IHyperAgentClient to the typed read/write halves

**What to build:** The **contract** step of the expand–contract refactor (tickets 06 and 07 are the expand). Every call site that uses the unified `IHyperAgentClient` is migrated to use either `IHyperAgentReadClient` (Polly-wrapped) or `IHyperAgentWriteClient` (direct). After this ticket lands, `IHyperAgentClient` is a union interface retained only for tests that need to mock both halves; production code touches the typed halves only. The migration covers `Features/Subscription/SubscriptionService.cs`, `Features/Profile/ProfileService.cs`, `Features/Publish/PublishService.cs`, `Features/Trailers/TrailerCache.cs`, `Features/Metadata/MetadataScanner.cs`, and `Features/Bootstrap/BootstrapInitializer.cs` in one atomic ticket commit.

**Blocked by:** 07, 18, 23, 25, 27, 30, 31

**Status:** ready-for-agent

- [ ] Each feature service takes its needed half (`IHyperAgentReadClient`, `IHyperAgentWriteClient`) via constructor injection
- [ ] No feature service consumes `IHyperAgentClient` directly after this ticket
- [ ] `IHyperAgentClient` is preserved as the test union but is not registered in production DI
- [ ] Unit tests for each migrated service assert the same external behaviour with the typed halves
- [ ] Integration tests still pass end-to-end via `WebApplicationFactory<Program>`
- [ ] No behaviour change — only the seam narrows; semantics stay identical
- [ ] ADR updated to note that the union interface exists for tests only (or delete the interface and have tests depend on both halves explicitly)
