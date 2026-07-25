/**
 * Hyper Agent RFC 9457 ProblemDetails primitives.
 *
 * Every 4xx / 5xx response from the Hyper Agent is a ProblemDetails
 * envelope:
 *
 *   {
 *     "type": "https://cinereel.dev/errors/<slug>",
 *     "title": "<short>",
 *     "status": <int>,
 *     "detail": "<optional human message>",
 *     "instance": "<request path>"
 *   }
 *
 * with `Content-Type: application/problem+json`. The HTTP-layer code
 * (`HttpExceptionFilter`) owns the envelope construction; business code
 * throws `HttpProblem` and the filter emits the body.
 *
 * `HttpProblem` deliberately does NOT extend `HttpException`. Nest's
 * built-in HttpException handler serialises the response with whatever
 * `getResponse()` returns, which would prevent our filter from
 * formatting the ProblemDetails envelope. Treating it as a plain Error
 * lets our global `@Catch()` filter intercept it before Nest does.
 *
 * ADR 0032 / ADR 0051 / ticket 08.
 */
import {
  PROBLEM_CONTENT_TYPE,
  httpStatusFallback,
  type ProblemTypeSpec,
} from './errors.const.js'

export { PROBLEM_CONTENT_TYPE, httpStatusFallback, type ProblemTypeSpec }

export * from './errors.const.js'

export interface ProblemDetails {
  type: string
  title: string
  status: number
  detail?: string
  instance?: string
}

/**
 * Build a ProblemDetails envelope from a `ProblemTypeSpec` and an
 * optional human-readable detail. The filter uses this for every
 * caught exception.
 */
export function toProblemDetails(
  spec: ProblemTypeSpec,
  options: { detail?: string; instance?: string } = {},
): ProblemDetails {
  return {
    type: spec.uri,
    title: spec.title,
    status: spec.status,
    ...(options.detail !== undefined ? { detail: options.detail } : {}),
    ...(options.instance !== undefined ? { instance: options.instance } : {}),
  }
}

/**
 * `HttpProblem` is the only exception the business layer throws. The
 * HTTP filter turns it into a ProblemDetails response. We do NOT embed
 * the envelope body inside the exception — the filter owns that —
 * because the filter needs to know the request path (`instance`).
 */
export class HttpProblem extends Error {
  constructor(
    public readonly spec: ProblemTypeSpec,
    public readonly detail?: string,
  ) {
    super(detail ?? spec.title)
    this.name = 'HttpProblem'
  }
}
