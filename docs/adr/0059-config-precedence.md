# App Server config: appsettings.json is the base, environment variables override, CLI flags not supported in V1

The .NET Application Server reads configuration from two sources, in this priority order (highest wins):

1. **Environment variables** — `CINEREEL_DATA_DIR`, `SIDECAR_PORT`, `Web__ListenPort`, `Logging__LogLevel__Default`, etc. ASP.NET Core's standard `__` separator replaces `:` in nested keys.
2. **`appsettings.json`** — the committed defaults, primarily dev-oriented values.

CLI flags are not read in V1. Operators wanting CLI-style overrides should set env vars (which Docker / systemd surface natively).

## Context

Cinereel needs a predictable config surface. The App Server is a long-running process with a few well-known settings (data dir, ports, log level). Three plausible shapes:

- **appsettings.json + env** — .NET default. Familiar to anyone who's run ASP.NET Core.
- **appsettings.json + env + CLI flags** — full flexibility. CLI flag parsing is non-trivial.
- **Env only** — single source. Operators editing appsettings.json is a footgun.

## Decision

appsettings.json + env. CLI flags deferred to V2.

### appsettings.json shape

```json
{
  "CINEREEL_DATA_DIR": "~/.cinereel",
  "SIDECAR_PORT": 4201,
  "Web": {
    "ListenPort": 8090,
    "ListenHost": "127.0.0.1"
  },
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Cinereel.Bt.Engine": "Debug"
    }
  },
  "Cinereel": {
    "TrailerCacheGB": 1,
    "BtStagingDir": null,
    "JellyfinUrl": null
  }
}
```

### Env var override examples

```bash
# Override listen port
Web__ListenPort=9090 dotnet CineReel.Service.dll

# Override data dir (Docker uses /data)
CINEREEL_DATA_DIR=/data dotnet CineReel.Service.dll
```

### Why not CLI flags

- Operators using Docker / systemd already prefer env vars.
- Adding CLI flag parsing (CommandLineParser or System.CommandLine) adds a dependency and another parsing surface.
- The App Server's startup arguments are the binary path and optional ASP.NET Core defaults (`--urls`, `--environment`); no V1-specific flags are needed.

### Why env wins over appsettings.json

- Docker injects env vars natively; Kubernetes too.
- Operators who copy-paste a config file into the repo (a footgun) lose to env vars.
- ASP.NET Core's configuration builder handles this automatically — no custom code.

### What's NOT in V1

- A config hot-reload watcher (ADR 0031 explicitly forbids this).
- A central config file at `/etc/cinereel/config.json` for system-wide installs.
- Per-section config file splitters (`appsettings.{env}.json`); a single `appsettings.json` is V1.
- Configuration validation at startup (e.g. `CINEREEL_DATA_DIR` must exist). Validation deferred to V2.

## Trade-off accepted

- Operators who want a persistent config file format must commit `appsettings.json`. They can't set env vars in a single file.
- ASP.NET Core's `__` separator is slightly unusual for newcomers. Documented.