// Workaround so the test process can spin up the App Server's `Program`
// without starting the live listener. `Program.cs` already declares the
// public `partial class Program;` marker for `WebApplicationFactory`.
namespace CineReel.Service.Infrastructure.OpenApi;

/// <summary>
/// Convenience endpoint group used by tests that want to introspect or
/// re-register the OpenAPI document outside of `Program.cs`.
/// </summary>
public static class OpenApiTestEndpoints
{
    public static IEndpointRouteBuilder MapOpenApiTestEndpoints(this IEndpointRouteBuilder endpoints, string routePrefix)
    {
        endpoints.MapGet(routePrefix + "/problem-details", () =>
        {
            return Results.Json(new
            {
                type = "string",
                title = "string",
                status = 0,
                detail = "string",
                instance = "string",
                correlationId = "string"
            });
        });

        return endpoints;
    }
}
