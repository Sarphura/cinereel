# RBAC uses `[RequirePermission("publish:*")]` attribute with wildcard matching

The .NET Application Server exposes a `[RequirePermission(string pattern)]` filter for Minimal API endpoints. The pattern supports wildcards (`*` matches one or more characters in a colon-separated segment). For example:

- `[RequirePermission("library:read")]` matches only the exact permission.
- `[RequirePermission("publish:*")]` matches `publish:create`, `publish:delete`, `publish:rename`, etc.
- `[RequirePermission("admin:*")]` matches every permission in the admin namespace.

## Context

The V1 permission list (`docs/05-accounts-permissions.md` plus ADR 0010) has 6 high-level permissions plus implicit sub-permissions. A user-friendly way to gate endpoints is required. Three plausible shapes:

- **String attribute with wildcards** — `publish:*` style. Compact, but typo-prone.
- **Enum attribute** — strong typing, but doesn't support wildcards.
- **ASP.NET Core Authorization Policies** — first-class, but each permission needs a handler class registered in DI. Overkill for ~10 permissions.

## Decision

String attribute with wildcard support.

### Attribute

```csharp
namespace Cinereel.Rbac;

[AttributeUsage(AttributeTargets.Method | AttributeTargets.Class, AllowMultiple = false)]
public sealed class RequirePermissionAttribute : Attribute, IEndpointFilter
{
    public string Pattern { get; }
    public RequirePermissionAttribute(string pattern)
    {
        if (string.IsNullOrWhiteSpace(pattern))
            throw new ArgumentException("pattern required", nameof(pattern));
        Pattern = pattern;
    }

    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext ctx, EndpointFilterDelegate next)
    {
        var user = ctx.HttpContext.User;
        if (user?.Identity?.IsAuthenticated != true)
            return Results.Unauthorized();

        var permissions = user.Claims
            .Where(c => c.Type == "cinereel:permission")
            .Select(c => c.Value)
            .ToHashSet();

        if (!PermissionMatcher.Match(permissions, Pattern))
            return Results.Forbid();

        return await next(ctx);
    }
}

internal static class PermissionMatcher
{
    public static bool Match(HashSet<string> userPermissions, string requiredPattern)
    {
        foreach (var perm in userPermissions)
        {
            if (perm == requiredPattern) return true;
            if (perm.EndsWith(":*") && requiredPattern.StartsWith(perm[..^2])) return true;
            if (perm == "*") return true; // super-admin
        }
        return false;
    }
}
```

### Wiring

Endpoints register the filter via `.RequirePermission("publish:*")`:

```csharp
app.MapDelete("/api/subscriptions/{key}", async (string key, ISubscriptionService svc) =>
{
    await svc.DeleteAsync(key, HttpContext.RequestAborted);
    return Results.NoContent();
}).RequirePermission("subscribe:*");
```

### Account permission claims

When the SessionAuthenticationMiddleware (ADR 0037) authenticates a request, it also reads the `accounts.permissions` JSON column and emits one `Claim` per permission. The `[RequirePermission]` filter reads these claims directly — no DB round-trip per request.

### Account schema update

The `accounts` table gains a `permissions` column:

```sql
CREATE TABLE accounts (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  is_admin BOOLEAN NOT NULL DEFAULT 0,
  permissions TEXT NOT NULL,           -- JSON array, e.g. '["library:read","publish:*"]'
  created_at TEXT NOT NULL,
  last_login_at TEXT
);
```

### Default permissions

- The bootstrap admin account is created with `permissions = ["*"]` (matches everything).
- New admin accounts added via the UI get a default set: `["library:read", "download:*", "subscribe:*", "publish:*", "profile:write"]`.
- Viewer accounts get `["library:read"]`.

### What's NOT in V1

- Resource-level ACL (a user can see only specific subscriptions). All permissions are global per account.
- Permission inheritance hierarchies (e.g. `admin:*` doesn't implicitly grant `publish:*` unless the wildcard matcher says so).
- Permission audit log.

## Trade-off accepted

- Strings are typo-prone. A typo in a feature PR doesn't fail compile-time. Mitigation: a unit test verifies that every endpoint's permission string is in the canonical list.
- The wildcard matcher is a 4-line snippet. If permission semantics get richer (e.g. conditional grants), this will need to grow.