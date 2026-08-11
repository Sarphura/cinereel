# 01 — Value Objects (DriveKey, Infohash, MediaItemId, MediaItemPath) + DomainValidationException

**What to build:** Every identifier Cinereel crosses module boundaries with is a typed `readonly record struct` value object instead of a naked string. `DriveKey` validates `^[0-9a-f]{64}$`. `Infohash` validates `^[0-9a-f]{40}$`. `MediaItemId` and `SubscriptionId` wrap `int`. `MediaItemPath` and `TorrentPath` wrap drive-relative strings. Every constructor that receives bad input throws `DomainValidationException(IReadOnlyDictionary<string, string[]>)`. Value objects serialize to their string form at JSON boundaries via `System.Text.Json` converters. Today the code uses `string` everywhere; this ticket adds the type layer the entire spec assumes.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] `Domain/Common/DriveKey.cs`, `Infohash.cs`, `SubscriptionId.cs`, `MediaItemId.cs`, `MediaItemPath.cs`, `TorrentPath.cs` defined as `readonly record struct`
- [ ] Constructors validate; bad input throws `DomainValidationException` with a `field → messages` map
- [ ] `DomainValidationException` lives in `Domain/Common/DomainValidationException.cs` and carries `IReadOnlyDictionary<string, string[]> Errors`
- [ ] JSON converters (`DriveKeyJsonConverter` etc.) emit strings on the wire so DTOs stay readable
- [ ] `Domain.UnitTests/Common/DriveKeyTests.cs`, `InfohashTests.cs`, `DomainValidationExceptionTests.cs` exist with table-driven `[Theory]` cases
- [ ] Existing `IHyperAgentClient` compiles unchanged (signature uses `string`); future tickets migrate call sites
- [ ] No behaviour change for callers that pass valid input — round-trip string → struct → string is identity
