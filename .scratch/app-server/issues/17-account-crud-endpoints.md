# 17 — Account CRUD endpoints: POST /api/accounts, PATCH /api/accounts/:id, POST /api/accounts/:id/permissions

**What to build:** Account management endpoints gated by `[RequirePermission("admin:*")]`. `POST /api/accounts` creates an account with a username and password (Argon2id-hashed), returns the new account id. `PATCH /api/accounts/:id` accepts partial updates: `enabled: bool` (disable / re-enable), `displayName: string`. `POST /api/accounts/:id/permissions` replaces the permission set atomically (returns 409 on invalid permission string). `GET /api/accounts` lists every account with id, username, permissions, enabled, last_login_at. `GET /api/accounts/:id` returns one. Bootstrap admin (ticket 24) creates the first account; this ticket owns everything else.

**Blocked by:** 01, 04, 05, 08, 09, 10

**Status:** ready-for-agent

- [ ] `Features/Accounts/AccountEndpoints.cs` registers the 5 endpoints with `[RequirePermission]` filters
- [ ] `Features/Accounts/IAccountService.cs` interface and `AccountService.cs` implementation with `CreateAsync`, `DisableAsync`, `EnableAsync`, `ReplacePermissionsAsync`, `ListAsync`, `FindAsync`
- [ ] `Features/Accounts/Dto/AccountResponse.cs`, `CreateAccountRequest.cs`, `UpdateAccountRequest.cs`, `ReplacePermissionsRequest.cs`
- [ ] `POST /api/accounts` validates: username uniqueness (409 `duplicate-username`), password length ≥ 8, permission strings ∈ `PermissionCatalog` (400 `invalid-permission`)
- [ ] `POST /api/accounts/:id/permissions` rejects an empty list and a list with a non-catalog string
- [ ] Unit tests cover: happy path, duplicate username, weak password, invalid permission, disabled-account login rejected
- [ ] Integration test via `WebApplicationFactory<Program>`: login as bootstrap admin → POST /api/accounts → logout → login as the new account → POST /api/accounts/:id/permissions returns 403
- [ ] No password is ever returned in a response body — only `id`, `username`, `permissions`, `enabled`, `createdAt`, `lastLoginAt`
