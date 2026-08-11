# 01 — Clone apps/sidecar into apps/hyper-agent (expand)

**What to build:** The Hyper Agent repository path comes into existence as a working clone of the current Sidecar. The new path builds, type-checks, and runs under its own dev script. The old `apps/sidecar` is still present and still builds, so CI stays green throughout the transition. No behaviour changes yet.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] `apps/hyper-agent/package.json` exists with `name: "@cinereel/hyper-agent"`, version bumped, all dependencies carried over from the Sidecar
- [ ] `apps/hyper-agent/src/**` is a structural clone of `apps/sidecar/src/**` (no semantic edits, only the package rename and log-prefix renames inside source comments and Swagger title)
- [ ] `pnpm -C apps/hyper-agent install` succeeds and `pnpm -C apps/hyper-agent typecheck` exits 0
- [ ] `pnpm -C apps/hyper-agent dev` boots NestJS and binds to 127.0.0.1 on the configured port, identical request shape to the Sidecar
- [ ] `apps/sidecar` is untouched: same `package.json`, same scripts, same source
- [ ] CI matrix builds both `apps/sidecar` and `apps/hyper-agent`; both stay green on every commit
