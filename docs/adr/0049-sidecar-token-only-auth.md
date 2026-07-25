# All Hyper Agent HTTP endpoints require a bearer token; there is no "public" set

The Hyper Agent's HTTP listener is bound to `127.0.0.1`. Every endpoint — including `/health`, `/api/swagger/v1.json`, and all `/v1/*` routes — requires an `Authorization: Bearer <sidecar.token>` header. The token is a 256-bit random value stored in `<CINEREEL_DATA_DIR>/sidecar.token` and shared between Hyper Agent and the App Server. There is no endpoint exempted from token auth.

## Context

ADR 0010 established that Hyper Agent binds 127.0.0.1 and shares a secret token with the App Server. The remaining question is whether some endpoints should be open (e.g. `/health` for external monitors, `/swagger.json` for human curl). Grilling considered splitting public vs admin and chose to require auth for all.

## Decision

All endpoints require the token. Concretely:

### `Authorization` header

```
Authorization: Bearer 5a4f...256-hex...
```

### Token lifecycle

- Hyper Agent startup reads `<CINEREEL_DATA_DIR>/sidecar.token` if it exists.
- If the file does not exist, Hyper Agent generates a new 32-byte random hex string and writes it to the file with `0600` permissions.
- App Server startup reads the same file via `CINEREEL_DATA_DIR` and uses the token to authenticate.

### What `/health` requires

`GET /health` requires the token. Operators debug by:

```bash
TOKEN=$(cat ~/.cinereel/sidecar.token)
curl -H "Authorization: Bearer $TOKEN" http://localhost:4201/health
```

The convenience is small; the principle (uniform auth) is more important.

### What `/v1/api-docs.json` requires

The OpenAPI doc is only useful to the App Server. It is also token-gated.

### What's NOT in V1

- Per-endpoint permissions — Hyper Agent has no user concept.
- A separate `/internal/health` that is token-free for system monitors.
- Token rotation — the token is generated once and reused until the operator deletes the file.

## Trade-off accepted

- Operators debugging Hyper Agent via curl must first obtain the token from disk.
- A mounted token file with `0600` permissions is acceptable but may be copied by mistake (e.g. a backup that includes `sidecar.token`). The threat model is local threats only.
- If V2 introduces a separate read-only HTTP surface for monitoring tools, this ADR is revisited.