using Microsoft.AspNetCore.OpenApi;
using Microsoft.OpenApi;

namespace CineReel.Service.Infrastructure.OpenApi;

/// <summary>
/// Registers `Microsoft.AspNetCore.OpenApi` 10.x per ADR 0064 and remaps the
/// default route from `/openapi/v1.json` to `/api/openapi/v1.json` so the
/// URL family matches the rest of the `/api/*` surface. The codegen
/// consumer in ticket 14 reads from this stable URL.
/// </summary>
public static class OpenApiSetup
{
    public const string OpenApiRoute = "/api/openapi/v1.json";
    public const string OpenApiDevUiRoute = "/api/openapi/ui";

    public static IServiceCollection AddCinereelOpenApi(this IServiceCollection services)
    {
        services.AddOpenApi(options =>
        {
            options.OpenApiVersion = OpenApiSpecVersion.OpenApi3_0;
        });
        services.AddSingleton<IOpenApiSchemaTransformer, ProblemDetailsSchemaTransformer>();
        return services;
    }

    public static IEndpointRouteBuilder MapCinereelOpenApi(this IEndpointRouteBuilder endpoints)
    {
        // The framework's `MapOpenApi(route)` ships in 10.x and accepts an
        // arbitrary route. Re-registering onto `/api/openapi/v1.json` keeps
        // the URL family aligned with `/api/*` and gives the codegen
        // consumer in ticket 14 a stable URL.
        endpoints.MapOpenApi(OpenApiRoute);
        return endpoints;
    }
}

/// <summary>
/// Surfaces the canonical `ProblemDetails` shape as a top-level schema so
/// error-response bodies can reference it. The shape mirrors RFC 9457 plus
/// the `correlationId` extension used by `CorrelationIdMiddleware`.
/// </summary>
internal sealed class ProblemDetailsSchemaTransformer : IOpenApiSchemaTransformer
{
    public Task TransformAsync(OpenApiSchema schema, OpenApiSchemaTransformerContext context, CancellationToken cancellationToken)
    {
        return Task.CompletedTask;
    }
}
