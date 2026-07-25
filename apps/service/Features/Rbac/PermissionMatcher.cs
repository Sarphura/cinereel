namespace CineReel.Service.Features.Rbac;

public static class PermissionMatcher
{
    public static bool Match(IReadOnlyCollection<string> userPermissions, string requiredPattern)
    {
        if (string.IsNullOrEmpty(requiredPattern)) return true;
        foreach (var granted in userPermissions)
        {
            if (Matches(granted, requiredPattern)) return true;
        }
        return false;
    }

    private static bool Matches(string granted, string requiredPattern)
    {
        if (granted == requiredPattern) return true;
        if (granted == PermissionCatalog.All) return true;
        if (granted.EndsWith(":*", StringComparison.Ordinal))
        {
            var prefix = granted[..^1];
            return requiredPattern.StartsWith(prefix, StringComparison.Ordinal);
        }
        if (requiredPattern.EndsWith(":*", StringComparison.Ordinal))
        {
            var prefix = requiredPattern[..^1];
            return granted.StartsWith(prefix, StringComparison.Ordinal);
        }
        return false;
    }
}
