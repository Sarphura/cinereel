using System.Security.Claims;
using CineReel.Service.Infrastructure.Auth;
using Microsoft.AspNetCore.Http;

namespace CineReel.Service.Features.Rbac;

public sealed class RequirePermissionAttribute(string pattern) : IEndpointFilter
{
    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        var user = context.HttpContext.User;
        if (user.Identity is null || !user.Identity.IsAuthenticated)
        {
            return Results.Problem(statusCode: StatusCodes.Status401Unauthorized, detail: "authentication required");
        }
        var permissions = user.Claims.Where(claim => claim.Type == CinereelClaims.PermissionClaimType).Select(claim => claim.Value).ToHashSet(StringComparer.Ordinal);
        if (!PermissionMatcher.Match(permissions, pattern))
        {
            return Results.Problem(statusCode: StatusCodes.Status403Forbidden, detail: $"permission '{pattern}' is required");
        }
        return await next(context);
    }
}
