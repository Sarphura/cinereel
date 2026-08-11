# 34 — OpenAPI drift check + web codegen integration (openapi-typescript pinned to /api/openapi/v1.json)

**What to build:** The web-codegen contract freeze (ADR 0042). `apps/web/` runs `openapi-typescript http://127.0.0.1:8090/api/openapi/v1.json -o src/api/generated.d.ts` at `prebuild` and `predev`. A CI step boots the App Server via `WebApplicationFactory<Program>`, fetches the OpenAPI document, writes a fixture to `apps/web/src/api/__fixtures__/openapi.json`, and the web build verifies the committed `generated.d.ts` matches. A failure on drift fails the build. Today the web build script targets `/api/swagger/v1.json` (the old Swashbuckle path) which no longer exists (ADR 0064 supersedes 0034).

**Blocked by:** 13

**Status:** ready-for-agent

- [ ] `apps/web/package.json` `prebuild` and `predev` scripts updated to read from `/api/openapi/v1.json`
- [ ] `apps/web/src/api/__fixtures__/openapi.json` checked in as the canonical fixture
- [ ] `scripts/check-openapi-drift.sh` (or equivalent) runs in CI: spawns App Server via test fixture, fetches the document, diffs against the fixture, fails on mismatch
- [ ] `apps/web/src/api/fetcher.ts` (the hand-written `apiFetch<T>`) compiles against the new generated types
- [ ] Unit test: a small change to a feature endpoint's response DTO triggers a fixture diff that fails CI
- [ ] No new feature in this ticket — only the codegen pipeline becomes real
