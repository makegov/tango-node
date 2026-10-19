import { describe, it, expect } from "vitest";
import { TangoClient, TangoRateLimitError } from "../../src/index.js";

function rateLimitedClient(body: string, headers: Record<string, string> = {}): TangoClient {
  return new TangoClient({
    apiKey: "k",
    baseUrl: "http://localhost",
    retries: 0,
    fetchImpl: (async () => new Response(body, { status: 429, headers })) as unknown as typeof fetch,
  });
}

async function catchRateLimit(client: TangoClient): Promise<TangoRateLimitError> {
  try {
    await client.getVersion();
  } catch (err) {
    if (err instanceof TangoRateLimitError) return err;
    throw err;
  }
  throw new Error("expected a TangoRateLimitError");
}

describe("TangoRateLimitError.limitType", () => {
  it.each([
    ["Rate limit exceeded for daily. Please try again in 16 hours, 58 minutes.", "daily"],
    ["Rate limit exceeded for daily. Please try again in 1 minute.", "daily"],
    ["Rate limit exceeded for burst. Please try again in 45 seconds.", "burst"],
    ["Rate limit exceeded for burst. Please try again in 1 minute.", "burst"],
    ["Rate limit exceeded for premium_daily. Please try again in 5 hours, 2 minutes.", "daily"],
    ["Too many requests.", null],
  ])("reads %j as %s", (detail, expected) => {
    const error = new TangoRateLimitError("Rate limit exceeded", 429, { detail });

    expect(error.limitType).toBe(expected);
  });

  it("is null without a detail", () => {
    expect(new TangoRateLimitError("Rate limit exceeded", 429, null).limitType).toBeNull();
  });
});

describe("rate limit type on a 429", () => {
  it("reports a daily lockout as daily on both the error and rateLimitInfo", async () => {
    const client = rateLimitedClient(
      JSON.stringify({ detail: "Rate limit exceeded for daily. Please try again in 16 hours, 58 minutes.", wait_in_seconds: 61080 }),
      { "content-type": "application/json", "x-ratelimit-daily-remaining": "0" },
    );

    const error = await catchRateLimit(client);

    expect(error.limitType).toBe("daily");
    expect(error.detail).toBe("Rate limit exceeded for daily. Please try again in 16 hours, 58 minutes.");
    expect(client.rateLimitInfo?.limitType).toBe("daily");
  });

  it("reports a burst limit as burst", async () => {
    const client = rateLimitedClient(JSON.stringify({ detail: "Rate limit exceeded for burst. Please try again in 1 minute.", wait_in_seconds: 60 }));

    const error = await catchRateLimit(client);

    expect(error.limitType).toBe("burst");
    expect(client.rateLimitInfo?.limitType).toBe("burst");
  });

  it("is null when the detail names no known limit", async () => {
    const client = rateLimitedClient(JSON.stringify({ detail: "Too many requests.", wait_in_seconds: null }));

    const error = await catchRateLimit(client);

    expect(error.limitType).toBeNull();
    expect(client.rateLimitInfo?.limitType).toBeNull();
  });

  it("is null when the body is not JSON", async () => {
    const client = rateLimitedClient("<html>429 Too Many Requests</html>", { "content-type": "text/html" });

    const error = await catchRateLimit(client);

    expect(error.detail).toBeNull();
    expect(error.limitType).toBeNull();
    expect(client.rateLimitInfo?.limitType).toBeNull();
  });

  it("prefers an X-RateLimit-Type header over the detail", async () => {
    const client = rateLimitedClient(JSON.stringify({ detail: "Rate limit exceeded for daily. Please try again in 2 hours." }), {
      "x-ratelimit-type": "burst",
    });

    const error = await catchRateLimit(client);

    expect(error.limitType).toBe("burst");
    expect(client.rateLimitInfo?.limitType).toBe("burst");
  });
});
