# 24 — Bootstrap admin + Demo drive on first launch (BootstrapInitializer IHostedService)

**What to build:** The first-launch experience from ADR 0063. `BootstrapInitializer : IHostedService` runs after migrations. It checks if `accounts` has any rows; if so, returns early. Otherwise: (1) generate a random 16-char alphanumeric password, write to `<CINEREEL_DATA_DIR>/bootstrap-admin.txt` with mode `0600`, log a warning that the file should be deleted after first login; (2) insert an `accounts` row for `admin` with `Permissions = ["*"]`, `IsAdmin = true`, `Enabled = true`; (3) call `IHyperAgentWriteClient.CreateDriveAsync("demo", "metadata")` to create the Demo resource drive, write `descriptor.json` with `ownerProfileKey = mainDriveKey`, and insert a `subscriptions` row pointing at it (state `active`); (4) log a one-time info line `Bootstrap complete. Admin password at <path>`. On every subsequent startup while `bootstrap-admin.txt` still exists, log a warning. Today the bootstrap path is entirely missing.

**Blocked by:** 01, 04, 05, 06, 08, 18

**Status:** ready-for-agent

- [ ] `Features/Bootstrap/BootstrapInitializer.cs` `IHostedService` running AFTER migrations and AFTER Hyper Agent readiness
- [ ] `Features/Bootstrap/RandomPasswordGenerator.cs` producing 16-char alphanumeric strings
- [ ] `Features/Bootstrap/BootstrapAdminWarningLogger.cs` logs a warning on every startup while `bootstrap-admin.txt` exists
- [ ] `IHyperAgentWriteClient.CreateDriveAsync(name, type)` is added by ticket 06 expansion; this ticket consumes it
- [ ] When `CINEREEL_DATA_DIR` already has an `accounts` row, no admin row is created and no Demo drive is created — the initializer is idempotent
- [ ] Unit tests: first-launch creates admin + writes password file + creates Demo drive + inserts subscription row; second-launch is a no-op; missing-file warning fires
- [ ] Integration test: full lifecycle — fresh `CINEREEL_DATA_DIR` → app starts → assert admin can log in with the bootstrap password → assert Demo drive is browseable
- [ ] Behaviour change from existing code (which never had this path) is documented
