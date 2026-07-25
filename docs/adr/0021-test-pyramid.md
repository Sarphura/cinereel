# Test pyramid: xUnit unit tests with InMemory repositories, plus a single integration smoke test

V1 has two layers of tests:

1. **Unit tests** (xUnit, .NET side) and **Vitest** (Node hyper-agent side). Unit tests use `InMemorySubscriptionRepository`, `InMemoryMediaItemRepository`, mock `ISidecarClient`, mock `IBtEngine`, and a fake `IClock`. No real DB, no real Hyperdrive, no real BT client.
2. **One integration smoke test** per release: spins up the .NET App Server + the Node Hyper Agent in the same container, creates a local drive, writes a known NFO + .torrent + poster, then verifies that the App Server's `media_items` table has the parsed entry, the Jellyfin library root has the expected folder layout, and BT state reflects `pending`.

The smoke test runs in CI (ADR 0018) and on every merge to `main`. It is shallow by design — it covers the happy path only.

## Context

After Q35 selection and ADR 0020's introduction of Repository interfaces and Domain Events, unit testing becomes tractable. The Application Server's services no longer depend on DbContext or Hyper-Hyper Agent RPC directly — they depend on repository interfaces and event handlers. This is the test pyramid's middle layer.

## Decision

### Unit tests (xUnit, .NET)

- `tests/Cinereel.UnitTests/` — one folder per feature.
- Each `*Service` has a `*ServiceTests.cs` with at least 3 cases:
  - Happy path
  - Validation failure (bad input → `DomainValidationException`)
  - Missing-aggregate case (query returns null)
- Use `[Theory]` + `[InlineData]` for table-driven tests.
- Use `InMemory*Repository` for state. Mock `ISidecarClient`, `IBtEngine`, `IClock` with Moq or NSubstitute.

### Unit tests (Vitest, Node Hyper Agent)

- `apps/sidecar/test/` — already in place per the existing project shape.
- Hyper Agent unit tests cover `FileService`, `DriveService`, `SwarmService` with mocked Hyperdrive interfaces.
- HTTP Range parsing has its own dedicated test file with table-driven Range header inputs.

### Integration smoke test

- `tests/Cinereel.IntegrationTests/SmokeTests.cs`.
- The smoke test:
  1. Boots the Hyper Agent as a child process pointing at a temp data dir.
  2. Polls `/health` for readiness.
  3. Boots the App Server with the Hyper Agent's loopback URL.
  4. Creates a resource drive via the App Server's publish API.
  5. Writes `descriptor.json`, `poster.jpg`, `movie.nfo`, `movie.torrent` via the Hyper Agent.
  6. Subscribes to the resource drive from a second App Server process (same binary, different data dir).
  7. Asserts the subscriber's `media_items` table has 1 row.
  8. Asserts the Jellyfin staging directory contains `Movies/Inception (2010) {imdb-tt1375666}/` with the expected files.
  9. Shuts both processes down.
- The smoke test runs in CI on every merge. It is fast (<30 seconds) and idempotent.

### What's NOT in V1 tests

- Cross-platform CI matrix tests (ADR 0018).
- Long-running stability tests (>5 minutes).
- Performance benchmarks.
- Mutation testing.

## Trade-off accepted

- InMemory repositories diverge from EF Core implementations in subtle ways (concurrency, transactions). We accept this because the smoke test catches integration issues.
- The smoke test is shallow. Edge cases (e.g. partial drive replication, BT seed handoff) are tested manually or deferred.
- No property-based testing or fuzz testing in V1.
