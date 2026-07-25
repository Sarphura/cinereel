# Cinereel ships as a single multi-stage Docker image based on `mcr.microsoft.com/dotnet/aspnet:10.0-noble` with Node 22 added in a build stage

The Dockerfile uses a multi-stage build:

- **Stage 1 (node-builder)**: `node:22-alpine` builds `apps/sidecar` (`pnpm install && pnpm build`) and `apps/web` (`pnpm build`) into `apps/web/dist`.
- **Stage 2 (dotnet-builder)**: `mcr.microsoft.com/dotnet/sdk:10.0-noble` builds `apps/service` (`dotnet publish -c Release -r linux-x64 --self-contained=false`).
- **Stage 3 (runtime)**: `mcr.microsoft.com/dotnet/aspnet:10.0-noble` with Node 22 installed via the NodeSource setup script. Copy hyper-agent build artifacts, app server build artifacts, and web dist into the image. Set the entrypoint to the App Server binary.

## Context

Cinereel's deployment shape is single-launcher (ADR 0017 + ADR 0022). A single Docker image containing App Server + Hyper Agent + SPA matches that shape. Three plausible base image choices:

- **`mcr.microsoft.com/dotnet/aspnet:10.0-noble` + Node** — Microsoft official, Ubuntu Noble base, regular OS patches. Larger (~600MB) but most predictable.
- **`node:22-alpine` + manual .NET runtime** — lighter but brittle on musl vs glibc.
- **`ubuntu:24.04` + everything** — most familiar, biggest image, slowest builds.

## Decision

`mcr.microsoft.com/dotnet/aspnet:10.0-noble` with Node 22 from NodeSource. Multi-stage build.

### Dockerfile sketch

```dockerfile
# Stage 1: Build hyper-agent + web
FROM node:22-alpine AS node-builder
WORKDIR /repo
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/sidecar/package.json ./apps/sidecar/
COPY apps/web/package.json ./apps/web/
RUN corepack enable && pnpm install --frozen-lockfile
COPY apps/sidecar/ ./apps/sidecar/
COPY apps/web/ ./apps/web/
COPY apps/core/ ./apps/core/
RUN pnpm --filter @cinereel/hyper-agent build
RUN pnpm --filter @cinereel/web build

# Stage 2: Build app server
FROM mcr.microsoft.com/dotnet/sdk:10.0-noble AS dotnet-builder
WORKDIR /repo
COPY apps/service/ ./apps/service/
RUN dotnet restore ./apps/service/CineReel.Service.csproj
RUN dotnet publish ./apps/service/CineReel.Service.csproj \
    -c Release -r linux-x64 --self-contained=false -o /out/app

# Stage 3: Runtime
FROM mcr.microsoft.com/dotnet/aspnet:10.0-noble AS runtime
# Install Node 22 from NodeSource
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=node-builder /repo/apps/sidecar/dist ./hyper-agent/
COPY --from=node-builder /repo/apps/sidecar/package.json ./hyper-agent/
COPY --from=node-builder /repo/apps/sidecar/node_modules ./hyper-agent/node_modules/
COPY --from=node-builder /repo/apps/web/dist ./wwwroot/
COPY --from=dotnet-builder /out/app ./

# Data volume
VOLUME ["/data"]
ENV CINEREEL_DATA_DIR=/data
ENV SIDECAR_PORT=4201
ENV Web__ListenPort=8090

EXPOSE 8090
ENTRYPOINT ["dotnet", "CineReel.Service.dll"]
```

### Image size

- Base: `aspnet:10.0-noble` ~ 200MB
- Node 22: ~ 60MB
- App Server build: ~ 80MB
- Hyper Agent + node_modules: ~ 120MB
- Total: ~ 460MB

Acceptable for a NAS deployment.

### Single-container rationale

- ADR 0017 mandates that App Server and Hyper Agent have linked lifecycle.
- ADR 0022 mandates that the App Server serves the SPA.
- Splitting into two containers would force operators to handle orchestration, shared volumes, and process restart policies manually.

### What's NOT in V1

- Multi-arch (`linux/arm64` for Raspberry Pi NAS, etc.). V1 is `linux-x64` only.
- Distroless final stage (Node isn't available for distroless).
- Scratch-base image (impossible due to glibc / Node requirement).

## Trade-off accepted

- Image is large (~460MB) by modern standards. Acceptable for self-hosted NAS deployments.
- The NodeSource install adds 60MB to the final image.
- Single-container deployment means no separate scaling. Acceptable because Cinereel is a personal app.