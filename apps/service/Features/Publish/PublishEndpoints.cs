using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;

namespace CineReel.Service.Features.Publish;

public static class PublishEndpoints
{
    public static IEndpointRouteBuilder MapPublishEndpoints(this IEndpointRouteBuilder endpoints)
    {
        if (endpoints is null) return endpoints!;
        var group = endpoints.MapGroup("/api/publish").WithTags("Publish");

        group.MapPost("/pack", async (AutoPackRequest request, IAutoPackService service, CancellationToken ct) =>
        {
            try
            {
                var response = await service.PackAsync(request, ct);
                return Results.Created($"/api/publish/{response.DriveKey}", response);
            }
            catch (AutoPackValidationException ex)
            {
                return Results.Problem(statusCode: StatusCodes.Status400BadRequest, title: ex.Code, detail: ex.Message);
            }
            catch (AutoPackUnavailableException ex)
            {
                return Results.Problem(statusCode: StatusCodes.Status503ServiceUnavailable, title: ex.Code, detail: ex.Message);
            }
        });

        group.MapPost("/drives", async (CreateDriveRequest request, IPublishService service, IIdentityService identity, CancellationToken ct) =>
        {
            try
            {
                var response = await service.CreateDriveAsync(request.Name, request.Type, identity.GetMainDriveKey(), ct);
                return Results.Created($"/api/publish/drives/{response.DriveKey}", response);
            }
            catch (PublishValidationException ex)
            {
                return Results.Problem(statusCode: StatusCodes.Status400BadRequest, title: ex.Code, detail: ex.Message);
            }
        });

        group.MapDelete("/drives/{key}", async (string key, IPublishService service, IIdentityService identity, CancellationToken ct) =>
        {
            try
            {
                await service.DeleteDriveAsync(key, identity.GetMainDriveKey(), ct);
                return Results.NoContent();
            }
            catch (PublishConflictException ex)
            {
                return Results.Problem(statusCode: StatusCodes.Status403Forbidden, title: ex.Code, detail: ex.Message);
            }
        });

        group.MapPost("/drives/{key}/announce", async (string key, AnnounceRequest request, IPublishService service, CancellationToken ct) =>
        {
            await service.AnnounceAsync(key, request.Wait, ct);
            return Results.Accepted();
        });

        return endpoints;
    }

    public static IEndpointRouteBuilder MapSwarmEndpoints(this IEndpointRouteBuilder endpoints)
    {
        if (endpoints is null) return endpoints!;
        var group = endpoints.MapGroup("/api").WithTags("Swarm");

        group.MapGet("/swarm/peers", async (IPublishService service, CancellationToken ct) =>
        {
            var peers = await service.GetPeersAsync(ct);
            return Results.Ok(new { peers });
        });

        group.MapGet("/identity", async (IPublishService service, IIdentityService identity, CancellationToken ct) =>
        {
            var dto = await service.GetIdentityAsync(identity.GetMainDriveKey(), ct);
            return Results.Ok(dto);
        });

        return endpoints;
    }
}