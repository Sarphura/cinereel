# 32 — FailedEntitySweeper + SessionExpirySweeper + Retry-now endpoint

**What to build:** The background reconciliation services. `FailedEntitySweeper : BackgroundService` runs every 60 seconds, queries every `subscriptions` row with `state = failed` and every `media_items` row with `jellyfin_state = failed`, and re-invokes the action that originally failed via the bus. On success, resets the state to its non-failed value. `SessionExpirySweeper : BackgroundService` runs every hour and deletes `sessions` rows with `expires_at < UtcNow` (the same sweeper is in ticket 08; this ticket integrates it with the bus and the `IEntityFailureMarker`). `POST /api/failed-entities/:type/:id/retry-now` is the manual "Retry now" button that bypasses the 60-second cycle and immediately re-publishes the failed event. Today the sweepers do not exist; failed entities stay failed forever.

**Blocked by:** 02, 03, 04, 05, 08

**Status:** ready-for-agent

- [ ] `Features/Recovery/FailedEntitySweeper.cs` `BackgroundService` running every 60 seconds
- [ ] `Features/Recovery/SessionExpirySweeper.cs` already exists from ticket 08; this ticket integrates it with `IEntityFailureMarker`
- [ ] `Features/Recovery/RecoveryEndpoints.cs` registers `POST /api/failed-entities/:type/:id/retry-now`
- [ ] `IEntityFailureMarker.MarkFailedAsync` from ticket 03 implemented here as `EfEntityFailureMarker` (writes to `subscriptions.state = failed` or `media_items.jellyfin_state = failed` depending on type)
- [ ] Retry-now logic: looks up the row, looks up the original event type from a `FailureJournal` table (lightweight: stores `entity_type, entity_id, event_type, cause, last_attempted_at`), re-publishes the event
- [ ] `IEntityFailureJournal` interface + `EfEntityFailureJournal` implementation in `Data/Repositories/`
- [ ] Unit tests with fake `IDomainEventBus` and fake repositories: sweeper re-publishes on each failed entity; retry-now endpoint bypasses the 60-second wait; session sweeper deletes expired rows only
- [ ] Integration test: subscribe → force a push failure → wait 65 seconds → assert the sweeper retried
