# 14 — SPA host: static files at / + MapFallback for client-side routing + appsettings.Web__StaticRoot

**What to build:** The SPA hosting model from ADR 0022. ASP.NET Core serves `apps/web/dist/` from `/` via static files. A `MapFallback` policy rewrites unknown paths to `index.html` for SPA client-side routing (e.g. `/subscriptions/abc123` reloads the SPA). `Web:StaticRoot` configures the directory (default `apps/web/dist/` relative to the App Server's content root). The single port is `Web:ListenPort` (default `8090`); the SPA, the `/api/*` JSON API, and the `/health` aggregator all share it. Today the App Server has no static-file serving.

**Blocked by:** 12 (needs `CinereelOptions.Web:StaticRoot`)

**Status:** ready-for-agent

- [ ] `Infrastructure/Web/StaticSiteSetup.cs` extension method `AddCinereelStaticSite(IApplicationBuilder)` registers `UseStaticFiles()` and `MapFallback()`
- [ ] `appsettings.json` gets `Web:StaticRoot = "apps/web/dist"`; the resolved path is relative to `AppContext.BaseDirectory`
- [ ] `dotnet publish` copies `apps/web/dist/**/*` into the publish output (via `<Content Include="apps/web/dist/**/*" CopyToPublishDirectory="PreserveNewest" />` in the `.csproj`)
- [ ] The single port is `Web:ListenPort`; no separate UI port
- [ ] Unit test: `StaticSiteTests.cs` boots via `WebApplicationFactory<Program>`, asserts `GET /` returns 200 with `Content-Type: text/html` (using a fake static-root with a stub `index.html`)
- [ ] Unit test: `GET /subscriptions/nonexistent` returns 200 with the `index.html` body (SPA fallback)
- [ ] Documented: external TLS via reverse proxy is the operator's responsibility; the App Server does not ship TLS
