# 11 — Logging surface: MEL JSON stdout + rotating file log + correlationId propagation

**What to build:** The structured-logging story from ADR 0036. `Microsoft.Extensions.Logging` only — no Serilog, no NLog. Two sinks: a `ConsoleLoggerProvider` that emits structured JSON (`{"@t":..., "@l":..., "@mt":..., "prop":...}`) and a `RotatingFileLoggerProvider` that writes human-readable lines to `<CINEREEL_DATA_DIR>/logs/cinereel.<date>.log` with daily rotation and 14-day retention. `Logging:LogLevel` is bound from `appsettings.json` + env vars. Defaults: `Default: Information`, `Cinereel.Bt.Engine: Debug`, `Cinereel.HyperAgent.Generated: Warning`. The `requestId` from the Hyper Agent boundary (X-Cinereel-Request-Id) is added to a `LogScope` so all subsequent App Server log lines carry it. App Server log prefix is `[app-server]`; the `[hyper-agent]` prefix comes through unchanged. Today the App Server uses `AddSimpleConsole` with text output and no file rotation.

**Blocked by:** None — can start immediately (parallel with 01–10).

**Status:** ready-for-agent

- [ ] `Infrastructure/Logging/RotatingFileLoggerProvider.cs` writing to `<CINEREEL_DATA_DIR>/logs/cinereel.<date>.log` with daily UTC rotation and 14-day retention
- [ ] `Infrastructure/Logging/LoggingSetup.cs` extension method `AddCinereelLogging(IHostBuilder)` configures `ClearProviders().AddJsonConsole().AddProvider(RotatingFileLoggerProvider)` and binds log levels
- [ ] `Infrastructure/Logging/RequestIdLogScope.cs` middleware reads `X-Cinereel-Request-Id` from incoming requests or generates a new GUID, attaches it to a `LogScope`
- [ ] `Infrastructure/Logging/HyperAgentRequestIdForwarder.cs` wraps every `IHyperAgentClient` call (via decorator) and forwards the current `RequestId` as `X-Cinereel-Request-Id` outbound
- [ ] Log levels: `Default: Information`, `Cinereel.Bt.Engine: Debug`, `Cinereel.HyperAgent.Generated: Warning`, `Microsoft.AspNetCore: Warning`
- [ ] `appsettings.json` updated with the documented `Logging:LogLevel` block
- [ ] DriveKeys in stdout logs are redacted to `<drive-key>` in production (`Logging:RedactDriveKeys: true` in `appsettings.json`); file logs keep them
- [ ] Unit tests: assert that a log call with a `RequestId` LogScope produces a JSON line with `RequestId` field; assert file rotation deletes files older than 14 days (fake `IClock`)
- [ ] Existing `Program.cs` `AddSimpleConsole` is replaced — behaviour change for local dev (now JSON instead of text) documented
