# 08 — Auth: Argon2id password hashing + AccountEntity persistence + SessionAuthenticationMiddleware

**What to build:** End-to-end session-cookie auth (ADR 0037). Accounts live in the new `accounts` table (ticket 04) with Argon2id-hashed passwords. `SessionAuthenticationMiddleware` reads the `cinereel_session` cookie, looks up the `sessions` table, attaches a `ClaimsPrincipal` with one `cinereel:permission` claim per entry in `accounts.permissions`. Cookie attributes: `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, `Max-Age=2592000`. Successful login (`POST /api/auth/login`) issues the cookie and refreshes `last_used_at` + `expires_at`. Logout (`POST /api/auth/logout`) deletes the row and clears the cookie. `SessionExpirySweeper : BackgroundService` runs hourly and removes expired rows. Today no auth code exists.

**Blocked by:** 01, 04, 05

**Status:** ready-for-agent

- [ ] `Features/Accounts/IPasswordHasher.cs` + `Argon2idPasswordHasher.cs` using `Konscious.Security.Cryptography.Argon2`
- [ ] `Features/Accounts/AccountService.cs` with `CreateAsync(username, password, permissions)`, `DisableAsync(id)`, `VerifyPasswordAsync(username, password)`
- [ ] `Features/Accounts/SessionService.cs` with `IssueAsync(accountId, ipAddress, userAgent)`, `RevokeAsync(token)`, `LookupAsync(token)`, `RefreshAsync(session)`
- [ ] `Infrastructure/Auth/SessionAuthenticationMiddleware.cs` reads the cookie, calls `SessionService.LookupAsync`, attaches `ClaimsPrincipal`, refreshes the row, sets `HttpContext.User`
- [ ] `Features/Accounts/LoginEndpoints.cs` registers `POST /api/auth/login` and `POST /api/auth/logout`
- [ ] `Features/Accounts/SessionExpirySweeper.cs` (BackgroundService) runs every hour and deletes rows with `expires_at < UtcNow`
- [ ] DI registration: middleware in `Program.cs` between `UseRouting()` and the endpoint mapping
- [ ] Unit tests: `SessionAuthenticationMiddlewareTests.cs` proves cookie issuance, refresh, expiry, anonymous fallback; `Argon2idPasswordHasherTests.cs` proves round-trip and wrong-password rejection
- [ ] No accounts exist yet — the bootstrap ticket (ticket 24) creates the first one
