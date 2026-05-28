import { describe, it, expect } from "vitest";
import { TangoClient, type AgencyRecord, type ProtestRecord, type ResolveResult, type ValidateResult } from "../../src/index.js";

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      ...headers,
    },
  });
}

describe("TangoClient observability properties", () => {
  it("rateLimitInfo and lastResponseHeaders start null", () => {
    const client = new TangoClient({ apiKey: "k", baseUrl: "http://localhost" });
    expect(client.rateLimitInfo).toBeNull();
    expect(client.lastResponseHeaders).toBeNull();
  });

  it("populates rateLimitInfo + lastResponseHeaders after a request", async () => {
    const fakeFetch = async () =>
      jsonResponse(
        { version: "4.5.2", date: "Mon, 11 May 2026 17:42:15 GMT" },
        200,
        {
          "x-ratelimit-remaining": "98",
          "x-ratelimit-limit": "100",
          "x-ratelimit-reset": "60",
          "x-ratelimit-type": "per_minute",
          "x-request-id": "req-abc",
        },
      );
    const client = new TangoClient({
      apiKey: "k",
      baseUrl: "http://localhost",
      fetchImpl: fakeFetch as unknown as typeof fetch,
      retries: 0,
    });
    await client.getVersion();
    expect(client.rateLimitInfo).toEqual({
      remaining: 98,
      limit: 100,
      resetIn: 60,
      retryAfter: null,
      limitType: "per_minute",
    });
    expect(client.lastResponseHeaders?.["x-request-id"]).toBe("req-abc");
    expect(client.lastResponseHeaders?.["x-ratelimit-remaining"]).toBe("98");
  });

  it("rateLimitInfo handles absent headers gracefully", async () => {
    const fakeFetch = async () => jsonResponse({ ok: true }, 200);
    const client = new TangoClient({
      apiKey: "k",
      baseUrl: "http://localhost",
      fetchImpl: fakeFetch as unknown as typeof fetch,
      retries: 0,
    });
    await client.getVersion();
    expect(client.rateLimitInfo).toEqual({
      remaining: null,
      limit: null,
      resetIn: null,
      retryAfter: null,
      limitType: null,
    });
  });
});

describe("listContracts cursor pagination", () => {
  it("passes cursor instead of page when cursor is provided", async () => {
    let capturedUrl = "";
    const fakeFetch = async (url: string) => {
      capturedUrl = url;
      return jsonResponse({
        count: 0,
        next: null,
        previous: null,
        results: [],
      });
    };
    const client = new TangoClient({
      apiKey: "k",
      baseUrl: "http://localhost",
      fetchImpl: fakeFetch as unknown as typeof fetch,
      retries: 0,
    });
    await client.listContracts({ cursor: "abc123", limit: 50 });
    expect(capturedUrl).toContain("cursor=abc123");
    expect(capturedUrl).not.toContain("page=");
  });

  it("sends neither page nor cursor when cursor is absent (cursor-only endpoint)", async () => {
    let capturedUrl = "";
    const fakeFetch = async (url: string) => {
      capturedUrl = url;
      return jsonResponse({
        count: 0,
        next: null,
        previous: null,
        results: [],
      });
    };
    const client = new TangoClient({
      apiKey: "k",
      baseUrl: "http://localhost",
      fetchImpl: fakeFetch as unknown as typeof fetch,
      retries: 0,
    });
    // `page` is ignored: /api/contracts/ is cursor-only.
    await client.listContracts({ page: 3 });
    expect(capturedUrl).not.toContain("page=");
    expect(capturedUrl).not.toContain("cursor=");
  });

  it("extracts cursor from next URL into PaginatedResponse.cursor", async () => {
    const fakeFetch = async () =>
      jsonResponse({
        count: 100,
        next: "https://api.example.com/api/contracts/?cursor=next-cursor-xyz&limit=25",
        previous: null,
        results: [],
      });
    const client = new TangoClient({
      apiKey: "k",
      baseUrl: "http://localhost",
      fetchImpl: fakeFetch as unknown as typeof fetch,
      retries: 0,
    });
    const resp = await client.listContracts({ cursor: "starting-cursor", limit: 25 });
    expect(resp.cursor).toBe("next-cursor-xyz");
    expect(resp.next).toContain("cursor=next-cursor-xyz");
  });

  it("PaginatedResponse.cursor is null for page-based responses", async () => {
    const fakeFetch = async () =>
      jsonResponse({
        count: 5,
        next: "https://api.example.com/api/contracts/?page=2&limit=25",
        previous: null,
        results: [],
      });
    const client = new TangoClient({
      apiKey: "k",
      baseUrl: "http://localhost",
      fetchImpl: fakeFetch as unknown as typeof fetch,
      retries: 0,
    });
    const resp = await client.listContracts({});
    expect(resp.cursor).toBeNull();
  });
});

describe("Typed return models (resolve / validate / getAgency / getProtest)", () => {
  it("resolve returns ResolveResult-shaped object", async () => {
    const fakeFetch = async () =>
      jsonResponse({
        count: 1,
        candidates: [
          { agency_id: "9700", display_name: "Department of Defense", score: 0.98, match_tier: "exact" },
        ],
      });
    const client = new TangoClient({
      apiKey: "k",
      baseUrl: "http://localhost",
      fetchImpl: fakeFetch as unknown as typeof fetch,
      retries: 0,
    });
    const r: ResolveResult = await client.resolve({ name: "DOD", target_type: "agency" });
    expect(r.count).toBe(1);
    expect(r.candidates).toHaveLength(1);
    expect(r.candidates[0].display_name).toBe("Department of Defense");
  });

  it("validate returns ValidateResult-shaped object", async () => {
    const fakeFetch = async () => jsonResponse({ result: "valid", type: "uei", value: "ABCDEF123456" });
    const client = new TangoClient({
      apiKey: "k",
      baseUrl: "http://localhost",
      fetchImpl: fakeFetch as unknown as typeof fetch,
      retries: 0,
    });
    const v: ValidateResult = await client.validate({ type: "uei", value: "ABCDEF123456" });
    expect(v.result).toBe("valid");
    expect(v.type).toBe("uei");
  });

  it("getAgency returns AgencyRecord-shaped object", async () => {
    const fakeFetch = async () =>
      jsonResponse({
        agency_id: "9700",
        name: "Department of Defense",
        abbreviation: "DOD",
        code: "97",
      });
    const client = new TangoClient({
      apiKey: "k",
      baseUrl: "http://localhost",
      fetchImpl: fakeFetch as unknown as typeof fetch,
      retries: 0,
    });
    const a: AgencyRecord = await client.getAgency("9700");
    expect(a.name).toBe("Department of Defense");
    expect(a.abbreviation).toBe("DOD");
  });

  it("getProtest returns ProtestRecord-shaped object", async () => {
    const fakeFetch = async () =>
      jsonResponse({
        case_id: "B-12345",
        case_number: "B-12345",
        source_system: "GAO",
        outcome: "dismissed",
      });
    const client = new TangoClient({
      apiKey: "k",
      baseUrl: "http://localhost",
      fetchImpl: fakeFetch as unknown as typeof fetch,
      retries: 0,
    });
    const p: ProtestRecord = await client.getProtest("B-12345");
    expect(p.case_id).toBe("B-12345");
    expect(p.source_system).toBe("GAO");
  });
});
