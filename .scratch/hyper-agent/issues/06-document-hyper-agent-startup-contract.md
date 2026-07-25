# 06 — Document startup contract in main.ts and README

**What to build:** The Hyper Agent's startup sequence — load config → load or generate token → construct NestJS → `app.init()` runs `BootstrapService.onModuleInit` → `app.listen()` binds 127.0.0.1 → install SIGTERM/SIGINT handlers — is written into the source as a single top-of-file comment in `main.ts`, and into the Hyper Agent's README as a section titled "Startup contract". A new contributor reading the source can answer "what does startup look like" in one minute.

**Blocked by:** 03 (path renamed)

**Status:** ready-for-agent

- [ ] `main.ts` top-of-file comment lists each startup step in order, with the failure mode that aborts each step
- [ ] `BootstrapService.onModuleInit` carries a comment explaining the load-index → mount-main → remount-non-main → seed-reverse-map → best-effort-announce sequence and which failures are fatal vs best-effort
- [ ] Hyper Agent README has a "Startup contract" section referencing `/healthz` as the readiness signal and the version-check contract from ADR 0033
- [ ] No behaviour change: pure documentation
- [ ] CI green; smoke test (when written) passes against this state
