# Authentication uses HTTP-only cookies backed by a SQLite session table

The .NET Application Server authenticates users via HTTP-only cookies. Sessions are server-side records in a new `sessions` SQLite table. Cookie contents are opaque random tokens (32 bytes hex); the table is the source of truth for validity. Logout deletes the row. Session expiry is 30 days, refreshed on each successful request.

## Context

Cinereel's deployment is a single-node, family-shared local app. Web UI is the primary client; mobile / TV clients are V2. The session model must be:

- Simple to reason about for a self-hosted user.
- Secure by default (HttpOnly, Secure, SameSite).
- Easy to revoke (e.g. a user wants to log out everywhere).

Three plausible shapes:

- **Cookie + server-side session** — server knows about every active session, can revoke any of them. Stored in SQLite.
- **JWT in cookie** — stateless, but revocation requires an additional blacklist table. Two sources of truth.
- **HTTP Basic** — too primitive for a UI-driven product.

## Decision

Cookie + server-side session.

### Schema

```sql
CREATE TABLE sessions (
  token TEXT PRIMARY KEY,             -- 32-byte random hex
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  last_used_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  ip_address TEXT,                    -- informational, for abuse detection
  user_agent TEXT                     -- informational
);

CREATE INDEX idx_sessions_account ON sessions(account_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);
```

### Cookie attributes

```
Set-Cookie: cinereel_session=<token>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000
```

- `HttpOnly`: JS cannot read.
- `Secure`: only over HTTPS (rely on user's reverse proxy to terminate TLS).
- `SameSite=Lax`: allows top-level navigation; blocks cross-site CSRF for state-changing requests.
- `Path=/`: applies to all App Server endpoints.

### Middleware

`SessionAuthenticationMiddleware`:

1. Reads `cinereel_session` cookie.
2. Looks up `sessions` table.
3. If found and not expired, refreshes `last_used_at` and `expires_at`, attaches `ClaimsPrincipal` to `HttpContext.User`.
4. If not found or expired, attaches `Anonymous`.
5. Writes back the refreshed cookie.

### Login flow

```
POST /api/auth/login
  Body: { username, password }
  → verify password (Argon2id hash)
  → create sessions row
  → Set-Cookie
  → 200 OK
```

### Logout flow

```
POST /api/auth/logout
  → DELETE FROM sessions WHERE token = ?
  → Set-Cookie (Max-Age=0)
  → 204 No Content
```

### Sessions expiry sweep

`SessionExpirySweeper : BackgroundService` runs every hour and deletes expired rows.

### What's NOT in V1

- JWT tokens (V2 may add for mobile clients).
- 2FA / TOTP (V2).
- Session activity log (which user did what).
- Multi-device concurrent-session limits (a user can have unlimited active sessions).

## Trade-off accepted

- SQLite reads for every request add overhead. Indexing on `token` keeps the lookup O(log n) but the cookie still does one round trip to the DB. Acceptable for V1's scale.
- Logout-everywhere requires either iterating all `sessions` rows for that account or "sessions tag" abstraction. V1 implements the simple "delete one row" only.