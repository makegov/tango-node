import { HttpClient } from "../../src/utils/http.js";
import {
  TangoAPIError,
  TangoAuthError,
  TangoNotFoundError,
  TangoRateLimitError,
  TangoTimeoutError,
  TangoValidationError,
} from "../../src/errors.js";

describe("HttpClient", () => {
  it("builds URLs with query parameters and passes headers", async () => {
    const calls: { url: string; init: RequestInit }[] = [];

    const fetchImpl = async (url: string | URL, init?: RequestInit): Promise<any> => {
      calls.push({ url: String(url), init: init ?? {} });

      const payload = {
        count: 1,
        next: null,
        previous: null,
        results: [{ key: "C-1" }],
      };

      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify(payload);
        },
      };
    };

    const client = new HttpClient({
      baseUrl: "https://example.test",
      apiKey: "test-key",
      fetchImpl,
    });

    const result = await client.get("/api/contracts/", {
      page: 2,
      limit: 10,
      search: "cloud",
    });

    expect(result).toHaveProperty("results");
    expect(calls).toHaveLength(1);

    const { url, init } = calls[0];
    const parsed = new URL(url);
    expect(parsed.origin).toBe("https://example.test");
    expect(parsed.pathname).toBe("/api/contracts/");
    expect(parsed.searchParams.get("page")).toBe("2");
    expect(parsed.searchParams.get("limit")).toBe("10");
    expect(parsed.searchParams.get("search")).toBe("cloud");

    expect(init.method).toBe("GET");
    expect(init.headers).toMatchObject({
      Accept: "application/json",
      "X-API-KEY": "test-key",
    });
  });

  it("maps HTTP status codes to specific error classes", async () => {
    const makeClient = (status: number, body: any) =>
      new HttpClient({
        baseUrl: "https://example.test",
        fetchImpl: async (): Promise<any> => ({
          ok: status >= 200 && status < 300,
          status,
          async text() {
            return JSON.stringify(body);
          },
        }),
      });

    await expect(makeClient(401, { detail: "nope" }).get("/api/contracts/")).rejects.toBeInstanceOf(TangoAuthError);

    await expect(makeClient(404, { detail: "missing" }).get("/api/contracts/")).rejects.toBeInstanceOf(
      TangoNotFoundError,
    );

    await expect(makeClient(429, { detail: "slow down" }).get("/api/contracts/")).rejects.toBeInstanceOf(
      TangoRateLimitError,
    );

    await expect(makeClient(400, { detail: "bad" }).get("/api/contracts/")).rejects.toBeInstanceOf(
      TangoValidationError,
    );

    await expect(makeClient(500, { detail: "oops" }).get("/api/contracts/")).rejects.toBeInstanceOf(TangoAPIError);
  });

  it("surfaces handled errors that arrive in a 200 payload", async () => {
    const client = new HttpClient({
      baseUrl: "https://example.test",
      fetchImpl: async (): Promise<any> => ({
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({
            error: "Request taking too long. Please try again later.",
          });
        },
      }),
    });

    await expect(client.get("/api/contracts/")).rejects.toBeInstanceOf(TangoAPIError);
  });

  it("maps abort/timeout errors to TangoTimeoutError", async () => {
    const client = new HttpClient({
      baseUrl: "https://example.test",
      fetchImpl: async () => {
        const err = new Error("This operation was aborted");
        err.name = "AbortError";
        throw err;
      },
    });

    await expect(client.get("/api/contracts/")).rejects.toBeInstanceOf(TangoTimeoutError);
  });

  it("serializes complex query params consistently", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const date = new Date("2024-01-01T00:00:00Z");

    const client = new HttpClient({
      baseUrl: "https://example.test/",
      fetchImpl: async (url: string | URL, init?: RequestInit): Promise<any> => {
        calls.push({ url: String(url), init: init ?? {} });
        return {
          ok: true,
          status: 200,
          async text() {
            return "{}";
          },
        };
      },
    });

    await client.get("/api/contracts/", {
      page: 1,
      tags: ["a", "b"],
      since: date,
      meta: { foo: "bar" },
    } as any);

    const search = new URL(calls[0].url).searchParams;
    expect(search.getAll("tags")).toEqual(["a", "b"]);
    expect(search.get("since")).toBe(date.toISOString());
    expect(search.get("meta")).toBe(JSON.stringify({ foo: "bar" }));
  });

  it("falls back to empty object when JSON parsing fails", async () => {
    const client = new HttpClient({
      baseUrl: "https://example.test",
      fetchImpl: async (): Promise<any> => ({
        ok: true,
        status: 200,
        async text() {
          return "not-json";
        },
      }),
    });

    const result = await client.get("/api/contracts/");
    expect(result).toEqual({});
  });

  it("extracts validation detail from field errors", async () => {
    const client = new HttpClient({
      baseUrl: "https://example.test",
      fetchImpl: async (): Promise<any> => ({
        ok: false,
        status: 400,
        async text() {
          return JSON.stringify({ field: ["bad input"] });
        },
      }),
    });

    await expect(client.get("/api/contracts/")).rejects.toThrow("Invalid request parameters: bad input");
  });
});
