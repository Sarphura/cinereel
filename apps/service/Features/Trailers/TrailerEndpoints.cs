using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;

namespace CineReel.Service.Features.Trailers;

public static class TrailerEndpoints
{
    public static IEndpointRouteBuilder MapTrailerEndpoints(this IEndpointRouteBuilder endpoints)
    {
        if (endpoints is null) return endpoints!;
        var group = endpoints.MapGroup("/api/trailers").WithTags("Trailers");

        group.MapGet("/{id}", async (string id, ITrailerCache cache, CancellationToken ct) =>
        {
            var bytes = await cache.LookupAsync(id, ct);
            return bytes is null ? Results.NotFound() : Results.File(bytes, "video/mp4");
        });

        group.MapDelete("/{id}", (string id, ITrailerCache cache) =>
        {
            cache.EvictUntilBelowFloorAsync();
            return Results.NoContent();
        });

        return endpoints;
    }
}