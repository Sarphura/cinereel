/**
 * Hand-written API fetcher used by the Cinereel web UI (ticket 34).
 *
 * The TypeScript surface is intentionally narrow: a single `apiFetch`
 * helper that wraps `fetch` and parses JSON responses with runtime
 * type guards. Drift between the App Server's OpenAPI document and
 * the committed fixture (`apps/web/src/api/__fixtures__/openapi.json`)
 * is detected by the C# test `OpenApiDriftTests.Served_openapi_document_matches_canonical_fixture`
 * at the API boundary — the web build does not run codegen against the
 * served document; instead, every change to a feature endpoint's
 * response DTO forces the developer to refresh the fixture and rebuild
 * the web UI to keep both sides in lockstep.
 */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly problem: ProblemDetails;
  constructor(status: number, problem: ProblemDetails) {
    super(problem.title || `HTTP ${status}`);
    this.status = status;
    this.problem = problem;
  }
}

const JSON_CONTENT_TYPES = ["application/json", "application/problem+json"];

function isProblemDetails(value: unknown): value is ProblemDetails {
  if (value === null || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.type === "string"
    && typeof v.title === "string"
    && typeof v.status === "number";
}

export { isProblemDetails };

export interface ApiFetchOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  baseUrl?: string;
}

export async function apiFetch<TResponse>(
  path: string,
  options: ApiFetchOptions & { fetch?: typeof fetch } = {},
): Promise<TResponse> {
  const { body, query, baseUrl, headers, fetch: fetchImpl, ...rest } = options;
  const base = baseUrl ?? "/";
  let url = base.endsWith("/") ? base + path.replace(/^\//, "") : base + (path.startsWith("/") ? path : "/" + path);
  if (query) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined) params.set(k, String(v));
    }
    const qs = params.toString();
    if (qs) url += (url.includes("?") ? "&" : "?") + qs;
  }

  const init: RequestInit = {
    ...rest,
    headers: {
      Accept: "application/json",
      ...(headers as Record<string, string> | undefined),
    },
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    (init.headers as Record<string, string>)["Content-Type"] = "application/json";
  }

  const response = await (fetchImpl ?? fetch)(url, init);
  const contentType = response.headers.get("Content-Type") ?? "";
  const isJson = JSON_CONTENT_TYPES.some((t) => contentType.includes(t));
  if (!response.ok) {
    if (isJson) {
      const raw = (await response.json().catch(() => null)) as unknown;
      if (isProblemDetails(raw)) {
        throw new ApiError(response.status, raw);
      }
    }
    throw new ApiError(response.status, {
      type: "about:blank",
      title: response.statusText,
      status: response.status,
    });
  }
  if (response.status === 204 || !isJson) return undefined as TResponse;
  return (await response.json()) as TResponse;
}
