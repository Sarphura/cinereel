# 08 — RFC 9457 ProblemDetails error envelope across all routes

**What to build:** Every 4xx and 5xx response from the Hyper Agent uses RFC 9457 ProblemDetails with `Content-Type: application/problem+json` and a stable `type` URI under `https://cinereel.dev/errors/<slug>`. The custom `{ error: { code, message, details? } }` shape and the `SidecarError` class are gone. The new global filter is small, the URI vocabulary is enumerated in one constants file, and every route is exercised by supertest assertions that pin the response shape.

**Blocked by:** 03 (path renamed)

**Status:** ready-for-agent

- [ ] `errors.const.ts` lists every `type` URI the Hyper Agent emits, grouped by HTTP status, with a one-line description of each
- [ ] `HttpExceptionFilter` is rewritten to emit RFC 9457 ProblemDetails for every caught exception, including the catch-all `http-<status>` for `HttpException` and `internal` (500) for unknown errors
- [ ] The `SidecarError` class and the `{ error: { code, message, details? } }` wire shape are deleted from the codebase
- [ ] Every controller route's existing supertest suite is updated to assert `Content-Type: application/problem+json` and the right `type` URI per trigger
- [ ] An `errors.spec.ts` enumerates every URI in `errors.const.ts` and proves each trigger produces the right body
- [ ] No 5xx response leaks a stack trace in the body
