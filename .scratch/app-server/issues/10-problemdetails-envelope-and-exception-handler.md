# 10 — ProblemDetails envelope + DomainExceptionHandler + ProblemTypes constants

**What to build:** Every 4xx and 5xx response goes through `DomainExceptionHandler : IExceptionHandler` (ADR 0032) and emits RFC 9457 ProblemDetails with a stable `type` URI under `https://cinereel.dev/errors/<slug>`. `Content-Type: application/problem+json`. Stack traces never appear in production bodies; a `correlationId` (GUID) is included and matches a structured log line. The 16 `type` URIs are enumerated in `ProblemTypes.cs` as `const string`. Three exception classes map to status codes: `DomainValidationException` → 400 with `errors` map, `RecoverableException` → 503 with `Retry-After`, `NonRecoverableException` → 500 with `correlationId`. Anything else → 500 generic. Today the App Server returns Kestrel's default 500 page on uncaught exceptions.

**Blocked by:** None — can start immediately (parallel with 01–09).

**Status:** ready-for-agent

- [ ] `Infrastructure/ProblemDetails/ProblemTypes.cs` static class with the 16 URIs (validation-failed, unauthenticated, forbidden, subscription-not-found, media-item-not-found, drive-not-mounted, invalid-drive-key, invalid-imdb-id, duplicate-subscription, nfo-parse-failed, jellyfin-push-failed, bt-engine-unavailable, trailer-fetch-failed, hyper-agent-unavailable, internal, http-<status>)
- [ ] `Infrastructure/ProblemDetails/DomainExceptionHandler.cs` implementing `IExceptionHandler.TryHandleAsync` and switching on exception type
- [ ] `Infrastructure/ProblemDetails/CorrelationIdMiddleware.cs` generates or reads `X-Cinereel-Request-Id` and stores it in `HttpContext.Items["CorrelationId"]`
- [ ] DI registration: `builder.Services.AddExceptionHandler<DomainExceptionHandler>()` plus `app.UseExceptionHandler()` in the pipeline
- [ ] The `ProblemDetails` bodies never include a stack trace; the body always includes `correlationId` and `type`
- [ ] Unit tests: `ProblemDetailsTests.cs` enumerates every `ProblemTypes` URI and triggers each via a fake controller, asserting the right status code and `type`
- [ ] 5xx responses log a stack trace to MEL JSON stdout with the same `correlationId` so operators can grep it
- [ ] No endpoint uses this yet — feature tickets gain ProblemDetails behaviour when they wire their endpoints
