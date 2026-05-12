/**
 * Tests for TangoClient async iteration (offset + cursor pagination).
 */

import { TangoClient } from "../../src/client.js";

type MockResponse = { ok: boolean; status: number; text: () => Promise<string> };

function makeFetch(
  pages: Array<{ count: number; next: string | null; results: Array<Record<string, unknown>> }>,
): { fetchImpl: typeof fetch; calls: string[] } {
  const calls: string[] = [];
  let i = 0;
  const fetchImpl = (async (url: string | URL): Promise<MockResponse> => {
    calls.push(String(url));
    const payload = pages[i] ?? { count: 0, next: null, results: [] };
    i += 1;
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({
          count: payload.count,
          next: payload.next,
          previous: null,
          results: payload.results,
        });
      },
    };
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe("TangoClient.iterate (offset pagination)", () => {
  it("walks pages via the `next` URL's `?page=` parameter", async () => {
    const base = "https://example.test";
    const { fetchImpl, calls } = makeFetch([
      {
        count: 5,
        next: `${base}/api/contracts/?page=2`,
        results: [{ piid: "A1" }, { piid: "A2" }],
      },
      {
        count: 5,
        next: `${base}/api/contracts/?page=3`,
        results: [{ piid: "B1" }, { piid: "B2" }],
      },
      {
        count: 5,
        next: null,
        results: [{ piid: "C1" }],
      },
    ]);

    const client = new TangoClient({ apiKey: "k", baseUrl: base, fetchImpl, retries: 0 });

    const seen: string[] = [];
    for await (const c of client.iterateContracts({ awarding_agency: "9700" })) {
      seen.push(String((c as Record<string, unknown>).piid ?? ""));
    }

    expect(seen).toEqual(["A1", "A2", "B1", "B2", "C1"]);
    expect(calls.length).toBe(3);

    // First call should NOT carry a page; subsequent should carry page=2 then page=3.
    const u1 = new URL(calls[0]);
    expect(u1.searchParams.get("page")).toBe("1"); // listContracts defaults page=1
    expect(u1.searchParams.get("awarding_agency")).toBe("9700");

    const u2 = new URL(calls[1]);
    expect(u2.searchParams.get("page")).toBe("2");
    expect(u2.searchParams.get("awarding_agency")).toBe("9700");

    const u3 = new URL(calls[2]);
    expect(u3.searchParams.get("page")).toBe("3");
  });
});

describe("TangoClient.iterate (cursor pagination)", () => {
  it("walks pages via the `next` URL's `?cursor=` parameter", async () => {
    const base = "https://example.test";
    const { fetchImpl, calls } = makeFetch([
      {
        count: 4,
        next: `${base}/api/idvs/?cursor=cur-page-2`,
        results: [{ piid: "X1" }, { piid: "X2" }],
      },
      {
        count: 4,
        next: null,
        results: [{ piid: "X3" }, { piid: "X4" }],
      },
    ]);

    const client = new TangoClient({ apiKey: "k", baseUrl: base, fetchImpl, retries: 0 });

    const seen: string[] = [];
    for await (const r of client.iterateIdvs()) {
      seen.push(String((r as Record<string, unknown>).piid ?? ""));
    }

    expect(seen).toEqual(["X1", "X2", "X3", "X4"]);
    expect(calls.length).toBe(2);

    expect(new URL(calls[0]).searchParams.get("cursor")).toBeNull();
    expect(new URL(calls[1]).searchParams.get("cursor")).toBe("cur-page-2");
  });
});

describe("TangoClient.iterate (early termination)", () => {
  it("stops when next is null on the first page", async () => {
    const base = "https://example.test";
    const { fetchImpl, calls } = makeFetch([
      { count: 1, next: null, results: [{ piid: "Z1" }] },
    ]);

    const client = new TangoClient({ apiKey: "k", baseUrl: base, fetchImpl, retries: 0 });

    const seen: string[] = [];
    for await (const c of client.iterateContracts()) {
      seen.push(String((c as Record<string, unknown>).piid ?? ""));
    }
    expect(seen).toEqual(["Z1"]);
    expect(calls.length).toBe(1);
  });

  it("stops cleanly if `next` is unparseable", async () => {
    const base = "https://example.test";
    const { fetchImpl } = makeFetch([
      { count: 1, next: "not-a-url", results: [{ piid: "ZZ" }] },
    ]);

    const client = new TangoClient({ apiKey: "k", baseUrl: base, fetchImpl, retries: 0 });

    const seen: string[] = [];
    for await (const c of client.iterateContracts()) {
      seen.push(String((c as Record<string, unknown>).piid ?? ""));
    }
    expect(seen).toEqual(["ZZ"]);
  });

  it("supports `break` mid-iteration (no extra requests after break)", async () => {
    const base = "https://example.test";
    const { fetchImpl, calls } = makeFetch([
      {
        count: 99,
        next: `${base}/api/contracts/?page=2`,
        results: [{ piid: "A" }, { piid: "B" }],
      },
      {
        count: 99,
        next: `${base}/api/contracts/?page=3`,
        results: [{ piid: "C" }, { piid: "D" }],
      },
    ]);
    const client = new TangoClient({ apiKey: "k", baseUrl: base, fetchImpl, retries: 0 });

    const seen: string[] = [];
    for await (const c of client.iterateContracts()) {
      seen.push(String((c as Record<string, unknown>).piid ?? ""));
      if (seen.length === 1) break;
    }
    expect(seen).toEqual(["A"]);
    // Only the first page should have been requested.
    expect(calls.length).toBe(1);
  });
});

describe("TangoClient.iterate (generic)", () => {
  it("rejects unknown method names", async () => {
    const client = new TangoClient({ apiKey: "k", baseUrl: "https://example.test", retries: 0 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const it = client.iterate("notARealMethod" as any);
    await expect(it.next()).rejects.toThrow(/Unknown list method/);
  });
});
