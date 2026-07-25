# 09 — Collapse auth to a single shared-secret bearer

**What to build:** The Hyper Agent authenticates every request with the shared secret in `<CINEREEL_DATA_DIR>/sidecar.token`, transmitted as `X-Sidecar-Token` or `Authorization: Bearer`. The legacy `POST /v1/auth/token` JWT exchange, the `SIDECAR_API_KEYS` env var, the `kid → JWT` signing path, and the `auth/jwt.ts` / `auth/keys.ts` modules are all removed. The Application Server is the only legitimate client; the shared-secret header is sufficient.

**Blocked by:** 03 (path renamed)

**Status:** ready-for-agent

- [ ] `POST /v1/auth/token` is removed from the Hyper Agent
- [ ] `auth/jwt.ts`, `auth/keys.ts`, the `AuthModule`, the `AuthController`, the `TokenRequestDto`, the `TokenResponseDto`, and `JWT_EXPIRY_SECONDS` are deleted
- [ ] The single auth middleware reads the token from `sidecar.token` once at startup and stores it in process memory; every request is matched against that constant
- [ ] `SIDECAR_API_KEYS` env var is no longer parsed; missing or empty `sidecar.token` triggers token generation (with 0600 perms) as before
- [ ] Every route's supertest suite includes: missing token → 401 ProblemDetails, wrong token → 401 ProblemDetails, correct token → 200/whatever-the-route-returns
- [ ] The Application Server's outbound client is configured to send `X-Sidecar-Token` on every request; an integration smoke proves end-to-end auth works after this change
