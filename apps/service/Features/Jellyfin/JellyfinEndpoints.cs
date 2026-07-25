using CineReel.Service.Data.Entities;
using CineReel.Service.Domain.Common;
using CineReel.Service.Features.Metadata;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;

namespace CineReel.Service.Features.Jellyfin;

public static class JellyfinEndpoints
{
    public static IEndpointRouteBuilder MapJellyfinEndpoints(this IEndpointRouteBuilder endpoints)
    {
        if (endpoints is null) return endpoints!;
        var group = endpoints.MapGroup("/api/media-items").WithTags("Jellyfin");

        group.MapPost("/{id:int}/push", async (int id, IMediaItemRepository repo, IJellyfinPusher pusher, CancellationToken ct) =>
        {
            var row = await repo.FindByIdAsync(new MediaItemId(id), ct);
            if (row is null) return Results.Problem(statusCode: StatusCodes.Status404NotFound, title: "media-item-not-found");
            var outcome = await pusher.PushAsync(row, ct);
            return outcome switch
            {
                JellyfinPushOutcome.Pushed => Results.Accepted(),
                JellyfinPushOutcome.Skipped => Results.Accepted(),
                JellyfinPushOutcome.Failed => Results.Problem(statusCode: StatusCodes.Status502BadGateway, title: "jellyfin-push-failed"),
                _ => Results.Problem(statusCode: StatusCodes.Status500InternalServerError),
            };
        });

        group.MapDelete("/{id:int}/jellyfin", async (int id, IMediaItemRepository repo, IJellyfinCleaner cleaner, CancellationToken ct) =>
        {
            var row = await repo.FindByIdAsync(new MediaItemId(id), ct);
            if (row is null) return Results.Problem(statusCode: StatusCodes.Status404NotFound, title: "media-item-not-found");
            await cleaner.RemoveAsync(row, ct);
            return Results.NoContent();
        });

        return endpoints;
    }
}