using Microsoft.AspNetCore.Routing;

namespace CineReel.Service.Features.Rbac;

public static class PermissionedEndpointExtensions
{
    public static RouteHandlerBuilder RequirePermission(this RouteHandlerBuilder builder, string pattern)
    {
        if (!PermissionCatalog.AllPermissions.Contains(pattern))
        {
            throw new ArgumentException($"Permission pattern '{pattern}' is not registered in PermissionCatalog.", nameof(pattern));
        }
        return builder.AddEndpointFilter<RequirePermissionAttribute>();
    }
}
