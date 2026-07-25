using CineReel.Service.Data;
using CineReel.Service.Data.Entities;
using CineReel.Service.Domain.Common;
using CineReel.Service.Events;
using Microsoft.EntityFrameworkCore;

namespace CineReel.Service.Features.Recovery;

/// <summary>
/// SQLite-backed failure journal. Stores
/// <c>(entity_type, entity_id, event_type, cause, last_attempted_at)</c>
/// so the FailedEntitySweeper and the retry-now endpoint can replay the
/// original event without keeping the in-memory state across restarts
/// (ticket 32).
/// </summary>
public sealed class EfEntityFailureJournal(IDbContextFactory<CinereelDbContext> dbFactory) : IEntityFailureJournal
{
    public async Task RecordAsync(
        string entityType,
        int entityId,
        string eventType,
        string cause,
        DateTimeOffset when,
        CancellationToken cancellationToken = default)
    {
        await using var db = await dbFactory.CreateDbContextAsync(cancellationToken);
        var existing = await db.FailureEntries
            .FirstOrDefaultAsync(
                entry => entry.EntityType == entityType && entry.EntityId == entityId,
                cancellationToken);
        if (existing is null)
        {
            db.FailureEntries.Add(new EntityFailureEntity
            {
                EntityType = entityType,
                EntityId = entityId,
                EventType = eventType,
                Cause = cause,
                LastAttemptedAt = when,
            });
        }
        else
        {
            existing.EventType = eventType;
            existing.Cause = cause;
            existing.LastAttemptedAt = when;
        }
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task<FailureEntry?> FindAsync(string entityType, int entityId, CancellationToken cancellationToken = default)
    {
        await using var db = await dbFactory.CreateDbContextAsync(cancellationToken);
        return await db.FailureEntries
            .Where(entry => entry.EntityType == entityType && entry.EntityId == entityId)
            .Select(entry => new FailureEntry(entry.EntityType, entry.EntityId, entry.EventType, entry.Cause, entry.LastAttemptedAt))
            .Cast<FailureEntry?>()
            .FirstOrDefaultAsync(cancellationToken);
    }

    public async Task ClearAsync(string entityType, int entityId, CancellationToken cancellationToken = default)
    {
        await using var db = await dbFactory.CreateDbContextAsync(cancellationToken);
        var existing = await db.FailureEntries
            .FirstOrDefaultAsync(
                entry => entry.EntityType == entityType && entry.EntityId == entityId,
                cancellationToken);
        if (existing is null) return;
        db.FailureEntries.Remove(existing);
        await db.SaveChangesAsync(cancellationToken);
    }
}

/// <summary>
/// Production failure marker (ticket 32). When an <see cref="IEntityDomainEvent"/>
/// exhausts its retries the marker records the entity as
/// <c>subscriptions.state = failed</c> or
/// <c>media_items.jellyfin_state = failed</c> and writes a journal entry.
/// The FailedEntitySweeper (ticket 32) consumes those marks to drive
/// recovery.
/// </summary>
public sealed class EfEntityFailureMarker(
    IDbContextFactory<CinereelDbContext> dbFactory,
    IEntityFailureJournal journal) : IEntityFailureMarker
{
    public async Task MarkFailedAsync(string entityType, object entityId, Exception cause, CancellationToken cancellationToken)
    {
        var id = Convert.ToInt32(entityId);
        var eventType = entityType switch
        {
            "subscription" => "SubscriptionRecovered",
            "media_item" => "MediaItemAdded",
            _ => "Unknown",
        };
        await using (var db = await dbFactory.CreateDbContextAsync(cancellationToken))
        {
            if (entityType == "subscription")
            {
                var sub = await db.Subscriptions.FindAsync([id], cancellationToken);
                if (sub is not null)
                {
                    sub.State = SubscriptionState.Failed;
                    sub.FailureReason = Truncate(cause.Message, 256);
                }
            }
            else if (entityType == "media_item")
            {
                var media = await db.MediaItems.FindAsync([id], cancellationToken);
                if (media is not null)
                {
                    media.JellyfinState = JellyfinState.Failed;
                }
            }
            await db.SaveChangesAsync(cancellationToken);
        }
        await journal.RecordAsync(
            entityType,
            id,
            eventType,
            Truncate(cause.Message, 1024),
            DateTimeOffset.UtcNow,
            cancellationToken);
    }

    private static string Truncate(string value, int max) =>
        value.Length <= max ? value : value[..max];
}