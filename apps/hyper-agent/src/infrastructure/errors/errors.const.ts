/**
 * Hyper Agent error vocabulary (RFC 9457 ProblemDetails).
 *
 * Every 4xx / 5xx response carries a stable `type` URI under
 * `https://cinereel.dev/errors/<slug>`. The App Server (and any future
 * curl-based debugging) switches on the URI; the human-readable `title`
 * and `detail` are for log lines.
 *
 * ADR 0032 and ADR 0051 are the source of truth for the envelope shape.
 * The URI vocabulary here is the **runtime** source — if you add a new
 * error condition, add a new entry below in the same commit.
 *
 * The `slug` is the trailing path component of the URI; it appears in
 * HTTP response bodies, in OpenAPI examples, and in tests. Don't reuse
 * a slug — slugs are how the App Server dispatches typed C# exceptions.
 */
const BASE_URI = 'https://cinereel.dev/errors'

function uri(slug: string): string {
  return `${BASE_URI}/${slug}`
}

export interface ProblemTypeSpec {
  /** Status code mapped to this URI. */
  status: number
  /** Short, human-readable title. */
  title: string
  /** Stable URI string. */
  uri: string
}

/** Drive key resolves to no mounted Hyperdrive. */
export const DRIVE_NOT_MOUNTED: ProblemTypeSpec = {
  status: 404,
  title: 'Drive not mounted',
  uri: uri('drive-not-mounted'),
}

/** Drive key fails the hex64 / shape check. */
export const INVALID_DRIVE_KEY: ProblemTypeSpec = {
  status: 400,
  title: 'Invalid drive key',
  uri: uri('invalid-drive-key'),
}

/** Generic input failed schema validation. */
export const INVALID_INPUT: ProblemTypeSpec = {
  status: 400,
  title: 'Invalid input',
  uri: uri('invalid-input'),
}

/** Path inside the drive is malformed or escapes the drive root. */
export const INVALID_PATH: ProblemTypeSpec = {
  status: 400,
  title: 'Invalid path',
  uri: uri('invalid-path'),
}

/** Range header could not be parsed (typo, missing bytes=). */
export const INVALID_RANGE: ProblemTypeSpec = {
  status: 400,
  title: 'Invalid Range header',
  uri: uri('invalid-range'),
}

/** Write attempted against a remote-mounted (read-only) drive. */
export const CANNOT_WRITE_REMOTE_DRIVE: ProblemTypeSpec = {
  status: 403,
  title: 'Cannot write to a remote drive',
  uri: uri('cannot-write-remote-drive'),
}

/** Single-range request with an unsatisfiable range (e.g. past EOF). */
export const RANGE_NOT_SATISFIABLE: ProblemTypeSpec = {
  status: 416,
  title: 'Range not satisfiable',
  uri: uri('range-not-satisfiable'),
}

/** Multi-range request — rejected per ADR 0047 / RFC 9110. */
export const MULTI_RANGE_NOT_SUPPORTED: ProblemTypeSpec = {
  status: 416,
  title: 'Multi-range request not supported',
  uri: uri('multi-range-not-supported'),
}

/** Auth header missing or empty. */
export const MISSING_TOKEN: ProblemTypeSpec = {
  status: 401,
  title: 'Missing token',
  uri: uri('missing-token'),
}

/** Auth header present but the value did not match sidecar.token. */
export const INVALID_TOKEN: ProblemTypeSpec = {
  status: 401,
  title: 'Invalid token',
  uri: uri('invalid-token'),
}

/**
 * Catch-all for unknown HttpException status codes that don't have a
 * dedicated URI. The 4xx / 5xx numeric is interpolated into the slug so
 * the URI stays stable for a given status.
 */
export function httpStatusFallback(status: number): ProblemTypeSpec {
  return {
    status,
    title: `HTTP ${status}`,
    uri: uri(`http-${status}`),
  }
}

/** Catch-all 500. Stack traces are NEVER included in the body. */
export const INTERNAL: ProblemTypeSpec = {
  status: 500,
  title: 'Internal error',
  uri: uri('internal'),
}

export const PROBLEM_CONTENT_TYPE = 'application/problem+json' as const
