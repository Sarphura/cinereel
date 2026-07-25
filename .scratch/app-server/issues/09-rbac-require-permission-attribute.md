# 09 — RBAC: [RequirePermission] attribute + PermissionMatcher + per-endpoint wiring

**What to build:** The `[RequirePermission(string pattern)]` endpoint filter from ADR 0038. The filter reads `cinereel:permission` claims from `HttpContext.User` and checks them against the pattern. Pattern grammar: `*` (super-admin), `exact` (`library:read`), `prefix:*` (`publish:*` matches `publish:create`, `publish:delete`, etc.). The `PermissionMatcher` is a 4-line snippet that compares the user's permission set to the required pattern. A 403 ProblemDetails is emitted when the user lacks the permission; a 401 is emitted when no user is attached. The filter is wired into Minimal API endpoints via `.RequirePermission("publish:*")`. Today no RBAC exists; everything is open.

**Blocked by:** 08

**Status:** ready-for-agent

- [ ] `Features/Rbac/RequirePermissionAttribute.cs` implementing `IEndpointFilter`
- [ ] `Features/Rbac/PermissionMatcher.cs` static class with `Match(HashSet<string> userPermissions, string requiredPattern)` covering all three pattern forms
- [ ] `Features/Rbac/PermissionCatalog.cs` static class with the canonical permission strings (`library:read`, `publish:*`, `subscribe:*`, `download:*`, `admin:*`, `profile:write`, etc.)
- [ ] Unit tests in `Features.UnitTests/Rbac/PermissionMatcherTests.cs` are table-driven: every pattern form × every permission set
- [ ] `IPermissionRepository` interface + `EfPermissionRepository` (reads from `accounts.permissions` JSON column via the claim-emission path) defined so future per-resource ACL can plug in
- [ ] `Rbac.UnitTests/CatalogDriftTests.cs` scans every endpoint registration in `Program.cs` and asserts that each `RequirePermission("...")` argument is in `PermissionCatalog` — typo guard
- [ ] No endpoint uses `[RequirePermission]` yet — feature tickets add it when they wire their routes
