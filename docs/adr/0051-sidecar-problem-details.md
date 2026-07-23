# Sidecar emits RFC 9457 ProblemDetails on all 4xx/5xx responses

The Hyper Sidecar's HTTP responses on error use the same RFC 9457 ProblemDetails format as the .NET App Server (ADR 0032):

```json
{
  "type": "https://cinereel.dev/errors/drive-not-mounted",
  "title": "drive not mounted",
  "status": 404,
  "detail": "no drive registered with driveKey a3f5...",
  "instance": "/v1/files/a3f5.../poster.jpg"
}
```

The custom `HttpExceptionFilter` at `apps/sidecar/src/core/common/filters/http-exception.filter.ts` is rewritten to emit this shape for every error path. The `type` URI is a stable identifier (not a documented URL) that the App Server can switch on. `instance` is the request path.

## Context

After ADR 0032 fixed the App Server's error response format, the Sidecar should use the same shape. The two services share an error contract with the App Server as the consumer.

## Decision

RFC 9457 ProblemDetails. Concretely:

### Type URIs

Each `type` URI is a stable identifier in the `https://cinereel.dev/errors/<slug>` namespace:

- `https://cinereel.dev/errors/drive-not-mounted` (404)
- `https://cinereel.dev/errors/invalid-drive-key` (400)
- `https://cinereel.dev/errors/invalid-range` (416)
- `https://cinereel.dev/errors/invalid-path` (400)
- `https://cinereel.dev/errors/cannot-write-remote-drive` (403)
- `https://cinereel.dev/errors/range-not-satisfiable` (416)
- `https://cinereel.dev/errors/internal` (500)

### Filter

```typescript
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const reply = ctx.getResponse<FastifyReply>()
    const request = ctx.getRequest<FastifyRequest>()

    let status = 500
    let type = 'https://cinereel.dev/errors/internal'
    let title = 'internal error'
    let detail: string | undefined = undefined

    if (exception instanceof DriveNotMountedError) {
      status = 404
      type = 'https://cinereel.dev/errors/drive-not-mounted'
      title = 'drive not mounted'
      detail = exception.message
    } else if (exception instanceof ZodError) {
      status = 400
      type = 'https://cinereel.dev/errors/invalid-input'
      title = 'invalid input'
      detail = JSON.stringify(exception.flatten())
    } else if (exception instanceof HttpException) {
      status = exception.getStatus()
      type = `https://cinereel.dev/errors/http-${status}`
      title = exception.message
    }

    reply
      .status(status)
      .header('Content-Type', 'application/problem+json')
      .send({ type, title, status, detail, instance: request.url })
  }
}
```

### Why `instance` is the request path

RFC 9457 says `instance` is a URI reference identifying the specific occurrence. The request path is good enough for V1; a request-ID can be added later.

### What's NOT in V1

- Type URIs as actual pages (they're identifiers, not landing pages).
- Localized `title`/`detail` strings.
- Stack traces in the body (development-mode only; production hides them).

## Trade-off accepted

- Filters must be imported globally via `app.useGlobalFilters(new HttpExceptionFilter())` (or per-controller). Missed setup means default Nest errors slip out.
- Hand-rolling type URIs is error-prone. A constants file (`errors.const.ts`) lists them.