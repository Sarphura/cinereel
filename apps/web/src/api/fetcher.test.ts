import { describe, expect, it } from "vitest";
import { ApiError, apiFetch, isProblemDetails } from "./fetcher";

describe("apiFetch", () => {
  it("parses JSON responses and surfaces ProblemDetails on error", async () => {
    let captured: { url: string; method: string; body: string | null } = {
      url: "",
      method: "",
      body: null,
    };
    const fetchImpl: typeof fetch = async (input, init) => {
      const req = input as Request;
      captured = {
        url: req.url,
        method: req.method,
        body: init?.body ? String(init.body) : null,
      };
      if (req.url.endsWith("/api/version")) {
        return new Response(
          JSON.stringify({ service: "cinereel-app-server", version: "v1" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({
          type: "https://cinereel.dev/errors/not-found",
          title: "not found",
          status: 404,
          detail: "no such resource",
        }),
        { status: 404, headers: { "Content-Type": "application/problem+json" } },
      );
    };

    const ok = await apiFetch<{ service: string; version: string }>("/api/version", { fetch: fetchImpl });
    expect(ok).toEqual({ service: "cinereel-app-server", version: "v1" });
    expect(captured.url).toContain("/api/version");

    await expect(
      apiFetch("/api/missing", { fetch: fetchImpl }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("isProblemDetails narrows error payloads", () => {
    expect(isProblemDetails({ type: "x", title: "t", status: 500 })).toBe(true);
    expect(isProblemDetails({ type: "x" })).toBe(false);
    expect(isProblemDetails(null)).toBe(false);
    expect(isProblemDetails("string")).toBe(false);
  });
});