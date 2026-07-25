# 15 — Boundary check script guards hyper-sdk imports repo-wide

**What to build:** `scripts/check-sdk-boundary.mjs` walks the repository and fails CI if `hyper-sdk`, `hypercore`, `hyperdrive`, `hyperswarm`, or `corestore` are imported from anywhere other than `apps/hyper-agent`. The Application Server, the shared library at `apps/core/`, and any future package cannot quietly reach into the SDK. The structural boundary from ADR 0002 is now mechanically enforced.

**Blocked by:** 03 (path renamed)

**Status:** ready-for-agent

- [ ] The script accepts a single allowlist entry: `apps/hyper-agent`
- [ ] The script is run on every PR via CI and fails the build on a hit outside the allowlist
- [ ] A negative test imports `hyper-sdk` from a temporary file under `apps/service`; the script exits non-zero and CI reports the offending path
- [ ] The script prints a clear message: "Hyper SDK imports are only allowed under apps/hyper-agent (see ADR 0002)"
- [ ] No behaviour change; this is a guardrail
