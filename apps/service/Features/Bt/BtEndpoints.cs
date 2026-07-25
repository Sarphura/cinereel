using CineReel.Service.Data.Entities;
using CineReel.Service.Domain.Common;
using CineReel.Service.Features.Bt;
using CineReel.Service.Features.Metadata.Events;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;

namespace CineReel.Service.Features.Bt;

public static class BtEndpoints
{
    public static IEndpointRouteBuilder MapBtEndpoints(this IEndpointRouteBuilder endpoints)
    {
        if (endpoints is null) return endpoints!;
        var group = endpoints.MapGroup("/api/media-items").WithTags("BT");

        group.MapPost("/{id:int}/pause-seeding", async (int id, IBtScheduler scheduler, CancellationToken ct) =>
        {
            await scheduler.PauseSeedingAsync(new MediaItemId(id), ct);
            return Results.Accepted();
        });

        group.MapPost("/{id:int}/resume-seeding", async (int id, IBtScheduler scheduler, CancellationToken ct) =>
        {
            await scheduler.ResumeAsync(new MediaItemId(id), ct);
            return Results.Accepted();
        });

        return endpoints;
    }
}