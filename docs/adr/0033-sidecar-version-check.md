# Sidecar exposes its version in /v1/health; App Server compares on startup and exits on mismatch

The Hyper Sidecar's `/v1/health` endpoint returns a JSON body `{ status: "ok", version: "<sidecar version>" }`. The Application Server's startup sequence:

1. Reads the App Server's version from its own assembly metadata.
2. Calls `/v1/health` on the Sidecar (after the readiness check from ADR 0017).
3. Compares `version` strings. If they differ, exits with code `76` (`EX_PROTOCOL`) and a clear error.

This enforces tight coupling: App Server and Sidecar must ship together.

## Context

Sidecar and App Server evolve together in the same repository. They share a release tag (e.g. v0.4.2). However, in deployment:

- A user upgrading the App Server container may leave a Sidecar container running from the previous version.
- A user running a Docker Compose stack may stop the Sidecar but forget to update it.
- A power user may run a development build of one side against a release build of the other.

The OpenAPI contract (NSwag-generated client per ADR 0033 below) catches *breaking* API changes at compile time, but not *non-breaking* mismatches (e.g. App Server expects `Range` support but the Sidecar is older and only supports `bytes=A-`).

## Decision

Tight coupling, with a startup-time version check.

### Sidecar version exposure

The Sidecar's `HealthController` returns:

```typescript
@Get('health')
async health(): Promise<{ status: 'ok'; version: string }> {
  return { status: 'ok', version: pkg.version }
}
```

The version string comes from `apps/sidecar/package.json`'s `version` field at build time.

### App Server version comparison

```csharp
var appVersion = Assembly.GetExecutingAssembly().GetName().Version!.ToString();
var health = await sidecarClient.GetHealthAsync();
if (health.Version != appVersion)
{
    throw new StartupException(
        $"Sidecar version mismatch: app={appVersion}, sidecar={health.Version}. " +
        $"Both processes must be the same release.");
}
```

The check runs after the readiness check (`/health` returns 200) but before the App Server's own HTTP listener starts.

### Why tight coupling

- V1's Sidecar API is small and stable. We expect to evolve it as a unit with the App Server.
- The check is one extra HTTP call at startup; runtime cost is zero.
- Users on a single Docker image / single binary get both components in lockstep by default.

### What's NOT in V1

- Capability negotiation (separate from version)
- Backward-compatibility flags
- Multi-version Sidecar support

## Trade-off accepted

- A Sidecar upgrade requires an App Server restart and vice versa. This is the simpler operational story.
- If we ever want Sidecar to be a separately installable service (e.g. as a shared daemon on a NAS for multiple App Server instances), this ADR will need to be revisited.