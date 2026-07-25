# V1 has no hot reload; configuration changes require App Server restart

The .NET Application Server reads `appsettings.json` (and `appsettings.{Environment}.json`) once at startup. Configuration changes are not observed at runtime. Modifying `appsettings.json` while the App Server is running has no effect until the next restart.

## Context

ASP.NET Core's `IConfiguration` system supports file-watch-based reload out of the box. The temptation is to enable `reloadOnChange: true` so operators can tweak settings without a restart. Grilling selected "no hot reload" for V1 because:

- The settings in question (Hyper Agent port, Jellyfin library root, MonoTorrent ports, database path) are typically set once at install time and never changed.
- Hot reload of complex structures (e.g. `BandwidthPolicy`) requires careful design — what's safe to change, what requires re-initialisation.
- Restart is cheap (<5 seconds for the App Server) and is the most predictable path.

## Decision

The App Server uses `Host.CreateApplicationBuilder` with `reloadOnChange: false`. Configuration is loaded once, bound to the strongly-typed `Settings` class, and frozen for the process lifetime.

### What is NOT in V1

- File-system watcher on `appsettings.json`.
- `IOptionsMonitor<T>` consumers (which would auto-reload).
- Environment-variable hot reload.

### V2 migration path

When operators report the cost of restart-on-config-change (e.g. bandwidth tweaks during a sustained swarm), introduce a hybrid: a `Settings` snapshot loaded at startup, plus a separate `RuntimeConfig` that can be updated via a `PUT /api/admin/config` endpoint and is propagated to consumers via `IOptionsMonitor`.

## Trade-off accepted

- Operators must restart the App Server after editing `appsettings.json`. This is the simplest possible mental model.
- Some test scenarios (e.g. flipping a feature flag at runtime) require a restart. Acceptable.