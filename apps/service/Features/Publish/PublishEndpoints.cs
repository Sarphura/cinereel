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

        return endpoints;
    }
}