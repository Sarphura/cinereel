# 02 — Switch CI and App Server spawn to apps/hyper-agent

**What to build:** The .NET Application Server's startup sequence spawns the Hyper Agent from the new path. CI runs lint, typecheck, build, and unit tests for the new path only. The old `apps/sidecar` still exists on disk but is no longer wired into any production path.

**Blocked by:** 01 (clone must exist first)

**Status:** ready-for-agent

- [ ] `apps/service` spawn script reads `HYPER_AGENT_BIN` / `HYPER_AGENT_ENTRY` (default `node /…/apps/hyper-agent/dist/main.js`) and spawns from there
- [ ] The Application Server's loopback HTTP readiness poll, version-check, and token read all still work end-to-end against the new path
- [ ] CI removes `apps/sidecar` from the build matrix; only `apps/hyper-agent` is built and tested
- [ ] `scripts/check-sdk-boundary.mjs` is updated so the allowlist contains `apps/hyper-agent` (and still allows `apps/sidecar` for now)
- [ ] A new contributor reading the codebase today sees the active path as `apps/hyper-agent` and the old path as a deprecated leftover
