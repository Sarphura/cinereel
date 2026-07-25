using CineReel.Service.Features.Metadata;
using CineReel.Service.Features.Recovery;
using CineReel.Service.Features.Subscription;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;

namespace CineReel.Service.Features.Recovery;

public static class RecoveryEndpoints
{
    public static IEndpointRouteBuilder MapRecoveryEndpoints(this IEndpointRouteBuilder endpoints)
    {
        if (endpoints is null) return endpoints!;
        var group = endpoints.MapGroup("/api/failed-entities").WithTags("Recovery");

        group.MapPost("/{type}/{id:int}/retry-now", async (string type, int id, IEntityFailureJournal journal, ISubscriptionService subscriptions, IMediaItemRepository media, CancellationToken ct) =>
        {
            var entry = await journal.FindAsync(type, id, ct);
            if (entry is null) return Results.NotFound();
            // Mark a fresh attempt timestamp and let the bus carry the original event.
            await journal.RecordAsync(type, id, entry.EventType, "retry-now", DateTimeOffset.UtcNow, ct);
            return Results.Accepted();
        });

        return endpoints;
    }
}