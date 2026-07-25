# 03 — Delete apps/sidecar

**What to build:** The old `apps/sidecar` directory is removed from the repository. The repo has exactly one Node application. CI, scripts, and the Application Server's spawn path all reference only `apps/hyper-agent`. The boundary check script's allowlist shrinks to one entry.

**Blocked by:** 02 (spawn switch must be live first so deletion cannot break startup)

**Status:** ready-for-agent

- [ ] `apps/sidecar/` directory is deleted in this commit
- [ ] No script, CI step, ADR, or spawn path references `apps/sidecar` or `Sidecar` as a code path (terminology renames live in M1, ticket 04)
- [ ] `scripts/check-sdk-boundary.mjs` only allowlists `apps/hyper-agent`
- [ ] CI matrix still green: full build, typecheck, lint, unit tests
- [ ] The Application Server starts end-to-end on a fresh clone of this commit
