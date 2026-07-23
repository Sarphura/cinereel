# Polly resilience pipeline is applied to read-only Sidecar calls only; write calls fail fast

The .NET Application Server wraps Sidecar read calls (`GetHealth`, `ListDrives`, `GetEntry`, `GetTree`, `ReadFile`) with a Polly pipeline:

- **Per-request timeout**: 30 seconds.
- **Retry on transient failure**: 3 attempts with exponential backoff (200ms / 1s / 5s).
- **Circuit breaker**: opens after 5 consecutive failures; stays open for 30 seconds; then half-open for one trial.

Write calls (`MountRemoteDrive`, `CreateDrive`, `WriteFile`, `DeleteFile`) bypass Polly and surface failures directly to the calling event handler (ADR 0027), which then decides retry policy.

## Context

Polly is a resilience library for .NET. It provides timeout, retry, circuit breaker, hedging, and other policies. Three plausible shapes:

- **Polly on all calls** — uniform treatment, but write-call retries can cause data anomalies (write-twice semantics).
- **Polly on read calls only** — read calls are idempotent and benefit from automatic retry; write calls fail fast and let the upper layer (event handler retry) decide.
- **No Polly** — hand-rolled retry in each handler. Duplication and inconsistency.

## Decision

Polly on read calls only.

### Pipeline shape

```csharp
var pipeline = new ResiliencePipelineBuilder()
    .AddTimeout(TimeSpan.FromSeconds(30))
    .AddRetry(new RetryStrategyOptions
    {
        MaxRetryAttempts = 3,
        Delay = TimeSpan.FromMilliseconds(200),
        BackoffType = DelayBackoffType.Exponential,
        UseJitter = true
    })
    .AddCircuitBreaker(new CircuitBreakerStrategyOptions
    {
        FailureRatio = 0.5,
        MinimumThroughput = 5,
        SamplingDuration = TimeSpan.FromSeconds(30),
        BreakDuration = TimeSpan.FromSeconds(30)
    })
    .Build();
```

### Wrapping

`ISidecarClient` interface is split into two:

- `ISidecarReadClient` — `GetHealthAsync`, `ListDrivesAsync`, `GetEntryAsync`, `GetTreeAsync`, `ReadFileAsync`. Wrapped by `ResilientSidecarReadClient` which applies the pipeline.
- `ISidecarWriteClient` — `MountRemoteDriveAsync`, `CreateDriveAsync`, `WriteFileAsync`, `DeleteFileAsync`. Wrapped by `DirectSidecarWriteClient` which is a thin pass-through.

`HealthCheck` (Q56) uses the read client. The SidecarVersionCheck (ADR 0033) uses the read client with a 5-second timeout.

### What failures does Polly handle?

- `HttpRequestException` (TCP refused, DNS error).
- `TaskCanceledException` after the per-request timeout fires.
- `SocketException` (transient network).

Polly does NOT handle `HttpRequestException` with HTTP 4xx (those are programmer errors, not transient). Polly only retries on 5xx and the exceptions above.

### Interaction with ADR 0027 (handler retry)

Polly's retry handles the call-level transient failure (network blip). ADR 0027's handler retry handles the *business-level* failure (e.g. Jellyfin push returned 502). They are separate layers and don't double-retry.

### What's NOT in V1

- Hedging (parallel requests to multiple Sidecar replicas) — V1 has one Sidecar.
- Rate limiting — Sidecar is loopback, no rate limit needed.
- Fallback policies — no alternate Sidecar to fall back to.

## Trade-off accepted

- Polly adds a dependency (`Polly.Core`, ~50KB).
- Two `ISidecarClient` interfaces instead of one complicates DI slightly.
- Polly's circuit breaker can false-positive during sustained high load. Operators should monitor break events via logs.