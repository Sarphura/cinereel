# 07 — Polly pipeline on IHyperAgentReadClient (timeout + retry + circuit breaker)

**What to build:** The Polly resilience pipeline from ADR 0039 wraps every Hyper Agent read call. `IHyperAgentReadClient` is split into a "direct" implementation and a `ResilientHyperAgentReadClient` decorator. Pipeline shape: `AddTimeout(30s)`, `AddRetry(MaxRetryAttempts=3, Delay=200ms, BackoffType=Exponential, UseJitter)`, `AddCircuitBreaker(FailureRatio=0.5, MinimumThroughput=5, SamplingDuration=30s, BreakDuration=30s)`. Retry only triggers on `HttpRequestException`, `TaskCanceledException` after the timeout, and `SocketException` — never on HTTP 4xx. The write client (`IHyperAgentWriteClient`) is direct; write errors propagate to the event handler retry layer (ADR 0027). Health check uses the resilient read client so the circuit breaker short-circuits when the Hyper Agent is down.

**Blocked by:** 06

**Status:** ready-for-agent

- [ ] `Infrastructure/HyperAgent/PollyPipelineFactory.cs` builds the shared `ResiliencePipeline` once
- [ ] `Infrastructure/HyperAgent/ResilientHyperAgentReadClient.cs` wraps `IHyperAgentReadClient` and applies the pipeline to each call
- [ ] DI registration in `Program.cs` binds `IHyperAgentReadClient` to `ResilientHyperAgentReadClient` and `IHyperAgentWriteClient` to the direct implementation
- [ ] The existing `HyperAgentClient.cs` from ticket 06 becomes the "direct" implementation; both halves implement only their respective interfaces
- [ ] `Polly.Core` 10.x added to the `.csproj`
- [ ] Unit tests with a fake `HttpMessageHandler` that returns 503 N times then 200: prove retry count, eventual 200, and circuit-breaker open after 5 failures within 30 seconds
- [ ] A test asserts that HTTP 400 responses do NOT trigger retries (4xx is propagated)
- [ ] Existing call sites compile unchanged (the resilient client implements `IHyperAgentReadClient` with the same signature)
