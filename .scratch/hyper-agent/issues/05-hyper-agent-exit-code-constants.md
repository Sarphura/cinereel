# 05 — Constants for Hyper Agent exit codes

**What to build:** The Hyper Agent's failure-mode exit codes are enumerated in a single constants module and referenced from every `process.exit(...)` site. Today, exit codes are scattered across inline literals with no documentation; the constants module makes them greppable, testable, and aligned with ADR 0017 / 0048 / 0056.

**Blocked by:** 03 (path renamed)

**Status:** ready-for-agent

- [ ] `exit-codes.ts` lists each exit code with its trigger condition: 73 port-in-use, 77 Corestore-missing-or-unwritable, 78 DI-failure, 79 drive-index-corrupt, 80 main-drive-mount-failure, 81 readiness-timeout-set-by-app-server
- [ ] Every `process.exit(...)` call site uses the named constant
- [ ] No behaviour change: the same exit code fires for the same trigger as before
- [ ] README or code comment explains which code means what to the App Server
- [ ] Existing unit tests pass; CI green
