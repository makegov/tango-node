/**
 * Tests for TANGO_BASE_URL env-var fallback in the TangoClient constructor.
 *
 * Precedence (highest to lowest):
 *   1. `options.baseUrl` (explicit)
 *   2. `process.env.TANGO_BASE_URL`
 *   3. `DEFAULT_BASE_URL`
 */

import { TangoClient } from "../../src/client.js";
import { DEFAULT_BASE_URL } from "../../src/config.js";

type MockResponse = { ok: boolean; status: number; text: () => Promise<string> };

function recordingFetch(): { fetchImpl: typeof fetch; lastUrl: () => string | null } {
  let last: string | null = null;
  const fetchImpl = (async (url: string | URL): Promise<MockResponse> => {
    last = String(url);
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({ count: 0, next: null, previous: null, results: [] });
      },
    };
  }) as unknown as typeof fetch;
  return { fetchImpl, lastUrl: () => last };
}

describe("TangoClient base URL resolution", () => {
  const origBaseUrlEnv = process.env.TANGO_BASE_URL;

  afterEach(() => {
    if (origBaseUrlEnv === undefined) {
      delete process.env.TANGO_BASE_URL;
    } else {
      process.env.TANGO_BASE_URL = origBaseUrlEnv;
    }
  });

  it("uses options.baseUrl when explicitly provided", async () => {
    process.env.TANGO_BASE_URL = "http://env-host:9999";
    const { fetchImpl, lastUrl } = recordingFetch();
    const client = new TangoClient({
      apiKey: "k",
      baseUrl: "http://explicit-host:8080",
      fetchImpl,
      retries: 0,
    });

    await client.listAgencies();

    expect(lastUrl()).toMatch(/^http:\/\/explicit-host:8080\//);
  });

  it("falls back to TANGO_BASE_URL env var when baseUrl is omitted", async () => {
    process.env.TANGO_BASE_URL = "http://localhost:8000";
    const { fetchImpl, lastUrl } = recordingFetch();
    const client = new TangoClient({
      apiKey: "k",
      fetchImpl,
      retries: 0,
    });

    await client.listAgencies();

    expect(lastUrl()).toMatch(/^http:\/\/localhost:8000\//);
  });

  it("falls back to DEFAULT_BASE_URL when neither baseUrl nor env is set", async () => {
    delete process.env.TANGO_BASE_URL;
    const { fetchImpl, lastUrl } = recordingFetch();
    const client = new TangoClient({
      apiKey: "k",
      fetchImpl,
      retries: 0,
    });

    await client.listAgencies();

    const url = lastUrl();
    expect(url).not.toBeNull();
    expect(url!.startsWith(DEFAULT_BASE_URL)).toBe(true);
  });
});
