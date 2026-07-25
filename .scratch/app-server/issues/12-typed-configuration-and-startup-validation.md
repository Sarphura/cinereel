# 12 — Configuration surface: typed CinereelOptions + env-var precedence + startup validation

**What to build:** Typed configuration binding from `appsettings.json` + environment variables (ADR 0059). `CinereelOptions` lives in `Infrastructure/Settings/CinereelOptions.cs` and binds sections for `HyperAgent:*`, `Jellyfin:*`, `Bt:*`, `Tmdb:*`, `Web:*`, `Database:*`, plus flat keys `CINEREEL_DATA_DIR`, `SIDECAR_PORT`, `Logging__LogLevel__Default`, `Web__ListenPort`, `Web__ListenHost`. ASP.NET Core's standard `__` separator replaces `:` in nested keys. Env vars win over `appsettings.json`. Startup validation refuses to launch if `CINEREEL_DATA_DIR` is unset or unwritable, if `HyperAgent:BaseUrl` is malformed, or if `Web:ListenPort` is unparseable. Today configuration is read ad-hoc in `Program.cs` (e.g. `builder.Configuration["SIDECAR_PORT"]`); this ticket centralises the binding.

**Blocked by:** None — can start immediately (parallel with 01–11).

**Status:** ready-for-agent

- [ ] `Infrastructure/Settings/CinereelOptions.cs` declares nested records for each section
- [ ] `Infrastructure/Settings/CinereelOptionsBinder.cs` extension method `AddCinereelOptions(IConfiguration)` binds env vars first, then `appsettings.json`
- [ ] `Infrastructure/Settings/StartupValidation.cs` runs `IValidateOptions<CinereelOptions>` and refuses startup with `NonRecoverableException` on bad config
- [ ] `appsettings.json` updated with the full documented block (from spec Implementation Decisions → Configuration)
- [ ] All existing hard-coded config reads in `Program.cs` (e.g. `builder.Configuration["Web:ListenPort"]`) are replaced with `CinereelOptions` reads
- [ ] Unit tests: env-var-wins-over-appsettings; nested `__` separator parses correctly; missing `CINEREEL_DATA_DIR` throws on validation; bad port string throws
- [ ] No hot-reload — ADR 0031 — and config changes require a restart
