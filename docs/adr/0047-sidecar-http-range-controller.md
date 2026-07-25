# HTTP Range handler lives in NestJS controller, delegating to FileService

The Hyper Agent's `GET /v1/files/:driveKey/*` endpoint is implemented as a standard NestJS controller method (`DrivesController.getFile`). The controller:

1. Resolves the drive via `FileService.readStream` (NestJS-injectable, returns a `Readable`).
2. Computes `Range` header parsing (or sets up a passthrough if no `Range` is supplied), via a small `@fastify/range` or hand-rolled parser.
3. Streams the response with appropriate `Content-Type`, `Content-Length`, `Accept-Ranges`, and `Content-Range` headers per RFC 9110.

## Context

After ADR 0005 + 0006 fixed that Hyper Agent exposes trailer via HTTP Range, the question became where to put the handler. Three plausible shapes:

- **NestJS controller** — same as every other HTTP route on the Hyper Agent. Routes through DI, zod validation, and Nest's exception filters.
- **Raw Fastify handler** — bypass Nest for one route to gain Fastify's native stream abstractions and skip the Nest per-request overhead. Loses DI.
- **Hybrid** — controller method just delegates to a service that does the streaming via a `@Res()` injection.

## Decision

NestJS controller. Concretely:

```typescript
@Controller('v1/files')
export class FilesController {
  constructor(private readonly fileService: FileService) {}

  @Get('*')
  async getFile(
    @Param('driveKey') driveKey: string,
    @Param('0') path: string,
    @Headers('range') range: string | undefined,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const stream = await this.fileService.readStream(driveKey, path, /*wait*/ true)
    const stat = await this.fileService.stat(driveKey, path)

    reply
      .header('Content-Type', guessContentType(path))
      .header('Accept-Ranges', 'bytes')
      .header('Cache-Control', 'public, max-age=31536000, immutable')

    if (range) {
      const { start, end } = parseRange(range, stat.size)
      reply
        .header('Content-Range', `bytes ${start}-${end}/${stat.size}`)
        .header('Content-Length', end - start + 1)
        .status(206)
      reply.send(stream.pipe(createRangeFilter(start, end)))
    } else {
      reply
        .header('Content-Length', stat.size)
        .status(200)
      reply.send(stream)
    }
  }
}
```

### Why controller, not raw Fastify handler

- DI is still useful: `FileService` is `@Injectable`, used by other controllers. A raw handler would duplicate the wiring.
- Nest's zod validation pipe applies the `driveKey` regex consistently.
- The `HttpExceptionFilter` already handles `DriveNotMountedError` (ADR 0044) uniformly.
- Performance cost of Nest is negligible compared to the actual read from Hyperdrive.

### Range parser

Hand-roll a 30-line parser (regex + byte arithmetic) covering:

- `bytes=0-499` — first 500 bytes.
- `bytes=500-` — from 500 onwards.
- `bytes=-500` — last 500 bytes.
- Multi-range `bytes=0-499,1000-1499` is rejected with 416 (RFC 9110 says single range only for HTTP/1.1 simplicity).

### Content-Type guessing

A 20-line extension table: `.mp4 → video/mp4`, `.webm → video/webm`, `.mkv → video/x-matroska`, `.jpg → image/jpeg`, `.png → image/png`, fall back to `application/octet-stream`.

### What's NOT in V1

- Multi-range responses (HTTP 206 with multipart/byteranges body).
- gzip / brotli compression.
- HEAD method (handled implicitly by Nest — returns headers only, no body).
- Conditional GET (`If-None-Match`, `ETag`).

## Trade-off accepted

- Reading the full Hyperdrive `stat` once per request adds ~5ms. Acceptable.
- The hand-rolled `Range` parser has known limitations (multi-range rejected). Acceptable.
- NestJS overhead per request is ~1ms. Acceptable.