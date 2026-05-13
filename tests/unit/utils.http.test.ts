import { HttpClient } from "../../src/utils/http.js";
import { TangoAPIError, TangoAuthError, TangoNotFoundError, TangoRateLimitError, TangoTimeoutError, TangoValidationError } from "../../src/errors.js";

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
        retries: 0,
        fetchImpl: async (): Promise<any> => ({
          ok: status >= 200 && status < 300,
          status,
          async text() {
            return JSON.stringify(body);
          },
        }),
      });

    await expect(makeClient(401, { detail: "nope" }).get("/api/contracts/")).rejects.toBeInstanceOf(TangoAuthError);

    await expect(makeClient(404, { detail: "missing" }).get("/api/contracts/")).rejects.toBeInstanceOf(TangoNotFoundError);

    await expect(makeClient(429, { detail: "slow down" }).get("/api/contracts/")).rejects.toBeInstanceOf(TangoRateLimitError);

    await expect(makeClient(400, { detail: "bad" }).get("/api/contracts/")).rejects.toBeInstanceOf(TangoValidationError);

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
      retries: 0,
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
      retries: 0,
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

  it("retries on 5xx and eventually succeeds", async () => {
    let calls = 0;
    const client = new HttpClient({
      baseUrl: "https://example.test",
      retries: 3,
      retryBackoffMs: 1, // keep test fast
      fetchImpl: async (): Promise<any> => {
        calls += 1;
        if (calls < 3) {
          return {
            ok: false,
            status: 503,
            headers: new Headers(),
            async text() {
              return "{}";
            },
          };
        }
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          async text() {
            return JSON.stringify({ ok: true });
          },
        };
      },
    });

    const result = await client.get<{ ok: boolean }>("/api/contracts/");
    expect(result.ok).toBe(true);
    expect(calls).toBe(3);
  });

  it("does NOT retry on 4xx (except 408/429)", async () => {
    let calls = 0;
    const client = new HttpClient({
      baseUrl: "https://example.test",
      retries: 5,
      retryBackoffMs: 1,
      fetchImpl: async (): Promise<any> => {
        calls += 1;
        return {
          ok: false,
          status: 403,
          headers: new Headers(),
          async text() {
            return JSON.stringify({ detail: "forbidden" });
          },
        };
      },
    });

    await expect(client.get("/api/contracts/")).rejects.toBeInstanceOf(TangoAPIError);
    expect(calls).toBe(1);
  });

  it("honors Retry-After on 429", async () => {
    let calls = 0;
    const t0 = Date.now();
    const client = new HttpClient({
      baseUrl: "https://example.test",
      retries: 2,
      retryBackoffMs: 5_000, // would dominate if not for Retry-After
      fetchImpl: async (): Promise<any> => {
        calls += 1;
        if (calls === 1) {
          return {
            ok: false,
            status: 429,
            headers: new Headers({ "Retry-After": "0" }), // tell client to retry immediately
            async text() {
              return JSON.stringify({ detail: "slow down" });
            },
          };
        }
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          async text() {
            return JSON.stringify({ ok: true });
          },
        };
      },
    });

    const result = await client.get<{ ok: boolean }>("/api/contracts/");
    const elapsed = Date.now() - t0;
    expect(result.ok).toBe(true);
    expect(calls).toBe(2);
    // Retry-After: 0 should mean we beat the (otherwise 5s) exponential backoff.
    expect(elapsed).toBeLessThan(1000);
  });

  it("gives up after retries are exhausted", async () => {
    let calls = 0;
    const client = new HttpClient({
      baseUrl: "https://example.test",
      retries: 2,
      retryBackoffMs: 1,
      fetchImpl: async (): Promise<any> => {
        calls += 1;
        return {
          ok: false,
          status: 500,
          headers: new Headers(),
          async text() {
            return JSON.stringify({ detail: "boom" });
          },
        };
      },
    });

    await expect(client.get("/api/contracts/")).rejects.toBeInstanceOf(TangoAPIError);
    expect(calls).toBe(3); // 1 initial + 2 retries
  });

  it("retries on network errors", async () => {
    let calls = 0;
    const client = new HttpClient({
      baseUrl: "https://example.test",
      retries: 2,
      retryBackoffMs: 1,
      fetchImpl: async (): Promise<any> => {
        calls += 1;
        if (calls < 2) {
          throw new TypeError("fetch failed");
        }
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          async text() {
            return JSON.stringify({ ok: true });
          },
        };
      },
    });

    const result = await client.get<{ ok: boolean }>("/api/contracts/");
    expect(result.ok).toBe(true);
    expect(calls).toBe(2);
  });
});
