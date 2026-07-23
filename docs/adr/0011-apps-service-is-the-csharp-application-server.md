# The C# Application Server is `apps/service`, upgraded from the legacy skeleton

The Cinereel repository's existing `apps/service/` directory (an ASP.NET Core 6 Web API skeleton from the pre-NestJS era) is repurposed as the new C# Application Server. The legacy NestJS service layer is removed. The skeleton's `WeatherForecast.cs` is deleted and the project is upgraded to .NET 10 LTS.

## Context

`apps/service/` has been a stub since the project's early days — `WeatherForecast.cs`, `Program.cs`, and a placeholder controller with no Cinereel logic. Earlier docs (`CONTEXT.md` line 96) mis-described it as a "NestJS layer" inherited from history; in fact it has always been an ASP.NET Core project that was set aside when the team adopted NestJS for the application layer.

After the Q25 decision to put the application domain in C# (ADR 0002), the question is whether to revive the existing skeleton or start fresh in a new directory. Reviving the skeleton preserves git history and avoids two parallel .NET projects during the transition.

## Decision

- `apps/service/` becomes the C# Application Server.
- Upgrade from .NET 6 to .NET 10 LTS.
- Delete `WeatherForecast.cs`.
- Rewrite `Program.cs` to host the real composition root: SQLite via EF Core, MonoTorrent `ClientEngine`, Hyper Sidecar OpenAPI client, Jellyfin push scheduler.
- `appsettings.json` becomes the source of truth for: `Sidecar:BaseUrl`, `Sidecar:TokenPath`, `Jellyfin:LibraryRoot`, `Jellyfin:BaseUrl`, `Jellyfin:ApiKey`, `Bt:ListenPort`, `Bt:DhtPort`, `Database:Path`, `Web:StaticRoot`.
- The project is renamed in spirit but the .csproj filename stays `CineReel.Service.csproj` to keep git history coherent.
- The legacy NestJS service (whatever fragments still exist outside `apps/service/`) is removed; the Search / Aggregation / Publication / Subscription modules it used to host now live in C#.

## Why not a fresh directory

A fresh `apps/dashboard/` or `apps/server/` would orphan the existing repo path, force contributors to re-learn the layout, and duplicate `appsettings.json` shape. The skeleton exists, was already intended for this role, and moving back into it is the path of least resistance.

## Trade-off accepted

The .csproj filename `CineReel.Service.csproj` is no longer accurate ("Service" was the NestJS-era name). Renaming would force a deeper commit and break any CI paths that reference the file. We accept the historical name to avoid churn.

The .NET 6 → .NET 10 upgrade is a one-time cost. EF Core 10, .NET 10's improved HTTP/3 Kestrel, and MonoTorrent's recent versions all assume .NET 8+, so the upgrade is unavoidable anyway.
