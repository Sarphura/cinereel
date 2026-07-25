# 07 — Atomic writes for DriveIndex on every mutation

**What to build:** Every write to `drive-index.json` is atomic. A crash mid-write leaves either the previous valid file or the new valid file on disk; never a half-formed file. A startup that finds a half-formed index fails loudly with exit 79 instead of silently dropping drives. This closes the most common silent-recovery footgun and makes `BootstrapService.onModuleInit` deterministic.

**Blocked by:** 03 (path renamed)

**Status:** ready-for-agent

- [ ] `DriveIndexRepository.set` and `delete` write to a temp file in the same directory and then rename over the target
- [ ] `BootstrapService.onModuleInit` validates the loaded index with a JSON parse + a minimum-shape check (`{ uuid → { name, type, createdAt } }`)
- [ ] A unit test simulates a half-formed `drive-index.json` and asserts the Hyper Agent exits 79 with a clear log line
- [ ] Existing happy-path tests still pass; smoke test unaffected
- [ ] No public API change
