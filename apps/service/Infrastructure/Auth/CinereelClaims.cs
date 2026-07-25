using System.Security.Claims;

namespace CineReel.Service.Infrastructure.Auth;

public static class CinereelClaims
{
    public const string PermissionClaimType = "cinereel:permission";

    public static ClaimsPrincipal BuildPrincipal(int accountId, string username, bool isAdmin, IReadOnlyList<string> permissions)
    {
        var identity = new ClaimsIdentity(CineReelAuth.Scheme);
        identity.AddClaim(new Claim(ClaimTypes.NameIdentifier, accountId.ToString(System.Globalization.CultureInfo.InvariantCulture)));
        identity.AddClaim(new Claim(ClaimTypes.Name, username));
        if (isAdmin)
        {
            identity.AddClaim(new Claim(ClaimTypes.Role, "admin"));
        }
        foreach (var permission in permissions)
        {
            identity.AddClaim(new Claim(PermissionClaimType, permission));
        }
        return new ClaimsPrincipal(identity);
    }
}
