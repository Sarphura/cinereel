# The .NET Application Server serves the SPA as static files at its root

The C# Application Server's Kestrel is the only HTTP listener exposed to the network. It serves the .NET Application Server's JSON API at `/api/*` and the built SPA bundle at `/*` (with a fallback to `index.html` for SPA client-side routing). The Sidecar continues to bind `127.0.0.1` only (ADR 0010). The SPA bundle is built into `apps/web/dist` and copied into the App Server's content root at build time.

## Context

Cinereel targets self-hosted deployment on a NAS or a small VPS (per the user's framing in Q36). The user is non-technical or only mildly technical. A "single port, single process, single container" deployment shape is the right product framing for that audience. Three options were considered:

- **ASP.NET Core serves SPA** — single port, single process, no Nginx/Caddy required.
- **Nginx + SPA + App Server separately** — best raw performance, but the user must write a reverse-proxy config.
- **CDN-served SPA + standalone API** — global CDN delivery, but CORS adds friction and is incompatible with the self-hosted ethos.

## Decision

ASP.NET Core hosts the SPA. Specifically:

1. The `apps/web` Vite build output (`apps/web/dist`) is copied into the App Server's `wwwroot/` directory at build time.
2. Kestrel serves files from `wwwroot/` at the root path. SPA client-side routes (e.g. `/subscriptions/123`) fall back to `index.html` via a `MapFallback` policy.
3. The App Server's API routes are mounted at `/api/*` (e.g. `/api/subscriptions`, `/api/media-items/:id/jellyfin-state`).
4. Sidecar's HTTP port is never reachable from outside (ADR 0010). The Sidecar is bound to `127.0.0.1:<random>` or a Unix socket.
5. The single exposed port is configured via `appsettings.json`'s `Web:ListenPort` (default `8090`).

For users who want TLS termination, an external Nginx / Caddy / Cloudflare Tunnel is acceptable. The App Server does not ship TLS itself (consistent with most self-hosted apps).

## Trade-off accepted

- Kestrel's static file throughput is lower than Nginx's by ~10-30%. For a single-user NAS / VPS workload, this is irrelevant.
- SPA updates require rebuilding and redeploying both the App Server and the SPA together. This is acceptable because the App Server already needs restart for code changes anyway.
- The user's external reverse proxy is a known requirement; we document it once and move on.
