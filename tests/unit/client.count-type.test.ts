/**
 * `PaginatedResponse.countType`, read from each list response's own `X-Results-CountType` header.
 */

import { TangoClient } from "../../src/client.js";

type Reply = { headers?: Record<string, string>; body?: unknown };

function makeClient(replies: Reply[]): TangoClient {
  let i = 0;
  const fetchImpl = (async () => {
    const reply = replies[Math.min(i++, replies.length - 1)];
    return {
      ok: true,
      status: 200,
      headers: new Headers(reply.headers ?? {}),
      async text() {
        return JSON.stringify(reply.body ?? { count: 1500, next: null, previous: null, results: [] });
      },
    };
  }) as unknown as typeof fetch;
  return new TangoClient({ apiKey: "k", baseUrl: "http://localhost:8000", fetchImpl, retries: 0 });
}

describe("PaginatedResponse.countType", () => {
  it.each([
    ["exact", "exact"],
    ["approximate", "approximate"],
    ["Approximate", "approximate"],
  ])("reads X-Results-CountType %s as %s", async (header, expected) => {
    const client = makeClient([{ headers: { "X-Results-CountType": header } }]);
    const res = await client.listContracts();
    expect(res.countType).toBe(expected);
  });

  it("is null when the API does not send the header", async () => {
    const client = makeClient([{}]);
    const res = await client.listOpportunities();
    expect(res.countType).toBeNull();
  });

  it("keeps each response's own value when two calls share a client", async () => {
    const client = makeClient([{ headers: { "X-Results-CountType": "approximate" } }, { headers: { "X-Results-CountType": "exact" } }]);
    const first = await client.listIdvs();
    const second = await client.listNotices();
    expect(first.countType).toBe("approximate");
    expect(second.countType).toBe("exact");
  });

  it("covers the generic list path too", async () => {
    const client = makeClient([{ headers: { "X-Results-CountType": "exact" } }]);
    const res = await client.listOtas();
    expect(res.countType).toBe("exact");
  });

  it("does not leak into the results or a JSON round-trip of the page", async () => {
    const client = makeClient([
      { headers: { "X-Results-CountType": "exact" }, body: { count: 1, next: null, previous: null, results: [{ key: "K1" }] } },
    ]);
    const res = await client.listOtas();
    expect(Object.keys(res.results[0])).toEqual(["key"]);
    expect(JSON.parse(JSON.stringify(res)).countType).toBe("exact");
  });
});

describe("IDV list methods return the pagination cursor", () => {
  const NEXT = "http://localhost:8000/api/idvs/?cursor=cur-2&limit=25";
  const body = { count: 30, next: NEXT, previous: null, results: [] };

  it.each([
    ["listIdvs", (c: TangoClient) => c.listIdvs()],
    ["listIdvAwards", (c: TangoClient) => c.listIdvAwards("IDV-KEY")],
    ["listIdvChildIdvs", (c: TangoClient) => c.listIdvChildIdvs({ key: "IDV-KEY" })],
    ["listIdvTransactions", (c: TangoClient) => c.listIdvTransactions("IDV-KEY")],
  ] as const)("%s", async (_name, call) => {
    const res = await call(makeClient([{ body }]));
    expect(res.cursor).toBe("cur-2");
  });
});
