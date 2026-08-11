/**
 * Range-header parser (ticket 11).
 *
 * Implements the Range header subset that ADR 0047 commits to: a single
 * `bytes=A-B`, `bytes=A-`, or `bytes=-N` range per request. Multi-range
 * requests (`bytes=A-B,C-D`) are rejected with `range-not-satisfiable`
 * (HTTP 416). The parser is intentionally small and side-effect-free so
 * it can be unit-tested with table-driven inputs.
 *
 *   - `bytes=0-499`     → start=0,  end=499
 *   - `bytes=500-`      → start=500, end=undefined  (open-ended)
 *   - `bytes=-500`      → start=undefined, end=499 (suffix)
 *
 * On malformed input the parser returns the `INVALID_RANGE` kind so the
 * controller can map it to a 400 ProblemDetails with `type:
 * https://cinereel.dev/errors/invalid-range`.
 */
export type RangeSpec =
  | { kind: 'none' }
  | {
      kind: 'single'
      start: number
      end: number
    }
  | { kind: 'multi' }
  | { kind: 'malformed'; reason: string }
  | { kind: 'invalid'; reason: string }

const BYTES_PREFIX = /^bytes=/i

/**
 * Parse an HTTP `Range` header value. The returned `RangeSpec.kind`
 * drives the controller's response shape:
 *   - `'none'`       → no Range header was sent; respond 200 + full body.
 *   - `'single'`     → respond 206 with the resolved slice.
 *   - `'multi'`      → respond 416 with `Content-Range: bytes star-div size`.
 *   - `'malformed'`  → respond 400 `invalid-range` ProblemDetails.
 *   - `'invalid'`    → respond 416 `range-not-satisfiable`.
 */
export function parseRange(header: string | undefined | null, size: number): RangeSpec {
  if (header == null || header.length === 0) return { kind: 'none' }

  const trimmed = header.trim()
  if (!BYTES_PREFIX.test(trimmed)) {
    return { kind: 'malformed', reason: `Range header must start with 'bytes=' (got: ${trimmed.slice(0, 32)})` }
  }
  const body = trimmed.replace(BYTES_PREFIX, '')
  if (body.length === 0) {
    return { kind: 'malformed', reason: 'Range header has empty range set' }
  }

  const ranges = body.split(',').map((s) => s.trim()).filter((s) => s.length > 0)
  if (ranges.length === 0) {
    return { kind: 'malformed', reason: 'Range header has empty range set' }
  }
  if (ranges.length > 1) {
    return { kind: 'multi' }
  }

  // After the comma-split, RFC 9110 forbids whitespace inside a single
  // range set. Check the original (pre-trim) form so `bytes= 0-499`
  // fails immediately rather than parsing as a valid range.
  const rawRange = body.split(',')[0]
  if (/\s/.test(rawRange)) {
    return { kind: 'malformed', reason: `Range set contains whitespace: ${rawRange}` }
  }
  const range = ranges[0]
  const dash = range.indexOf('-')
  if (dash < 0) {
    return { kind: 'malformed', reason: `Range set missing dash: ${range}` }
  }
  const startStr = range.slice(0, dash)
  const endStr = range.slice(dash + 1)

  // `bytes=-500` → suffix (last 500 bytes).
  if (startStr.length === 0) {
    if (endStr.length === 0) {
      return { kind: 'malformed', reason: `Range set is empty: ${range}` }
    }
    const n = Number(endStr)
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
      return { kind: 'malformed', reason: `Suffix length is not a non-negative integer: ${endStr}` }
    }
    if (n === 0) {
      return { kind: 'invalid', reason: 'Suffix length is zero' }
    }
    if (size === 0) {
      return { kind: 'invalid', reason: 'Resource is empty; suffix range unsatisfiable' }
    }
    const start = Math.max(0, size - n)
    return { kind: 'single', start, end: size - 1 }
  }

  // `bytes=500-` → open-ended.
  if (endStr.length === 0) {
    const start = Number(startStr)
    if (!Number.isFinite(start) || !Number.isInteger(start) || start < 0) {
      return { kind: 'malformed', reason: `Range start is not a non-negative integer: ${startStr}` }
    }
    if (size === 0 || start >= size) {
      return { kind: 'invalid', reason: `Open-ended range start ${start} exceeds size ${size}` }
    }
    return { kind: 'single', start, end: size - 1 }
  }

  // `bytes=A-B` → closed range.
  const start = Number(startStr)
  const end = Number(endStr)
  if (!Number.isFinite(start) || !Number.isInteger(start) || start < 0) {
    return { kind: 'malformed', reason: `Range start is not a non-negative integer: ${startStr}` }
  }
  if (!Number.isFinite(end) || !Number.isInteger(end) || end < 0) {
    return { kind: 'malformed', reason: `Range end is not a non-negative integer: ${endStr}` }
  }
  if (start > end) {
    return { kind: 'malformed', reason: `Range start ${start} is greater than end ${end}` }
  }
  if (size === 0 || start >= size) {
    return { kind: 'invalid', reason: `Closed range start ${start} exceeds size ${size}` }
  }
  // Cap `end` at size-1; the spec allows clients to send ranges beyond
  // the resource size and expects the server to clamp to the actual length.
  const clampedEnd = Math.min(end, size - 1)
  return { kind: 'single', start, end: clampedEnd }
}
