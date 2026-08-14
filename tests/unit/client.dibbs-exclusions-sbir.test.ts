/**
 * Tests for the DIBBS, exclusions, and SBIR/STTR endpoint families.
 *
 * Covers the request contract for each method — correct path, filters passed
 * through under the API's own param names, the documented default shape —
 * via the injected fetchImpl mock. Mirrors tango-python's
 * tests/test_dibbs_exclusions_sbir.py.
 */

import { TangoClient } from "../../src/client.js";
import { ShapeConfig } from "../../src/config.js";

type RecordedCall = { url: string; init?: RequestInit | undefined };

interface MockResponseBody {
  count?: number;
  next?: string | null;
  previous?: string | null;
  results?: unknown[];
  [key: string]: unknown;
}

function recordingFetch(body: MockResponseBody | unknown = { count: 0, next: null, previous: null, results: [] }): {
  fetchImpl: typeof fetch;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify(body);
      },
    };
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

function makeClient(body?: MockResponseBody | unknown): { client: TangoClient; calls: RecordedCall[] } {
  const { fetchImpl, calls } = recordingFetch(body);
  const client = new TangoClient({
    apiKey: "k",
    baseUrl: "http://localhost:8000",
    fetchImpl,
    retries: 0,
  });
  return { client, calls };
}

function params(calls: RecordedCall[]): URLSearchParams {
  return new URL(calls[0].url).searchParams;
}

describe("TangoClient — DIBBS RFQs", () => {
  it("listDibbsRfqs hits /api/dibbs/rfqs/ with filters under API param names", async () => {
    const { client, calls } = makeClient();
    await client.listDibbsRfqs({ nsn: "5310-00-000-0000", open: true, quantity_min: 5, limit: 10 });

    expect(calls[0].url).toContain("/api/dibbs/rfqs/");
    const p = params(calls);
    expect(p.get("nsn")).toBe("5310-00-000-0000");
    // `open` is the filter; `is_open` is query-time derived and not filterable.
    expect(p.get("open")).toBe("true");
    expect(p.has("is_open")).toBe(false);
    expect(p.get("quantity_min")).toBe("5");
    expect(p.get("page")).toBe("1");
    expect(p.get("limit")).toBe("10");
    expect(p.get("shape")).toBe(ShapeConfig.DIBBS_RFQS_MINIMAL);
  });

  it("listDibbsRfqs passes date-range and ordering params through", async () => {
    const { client, calls } = makeClient();
    await client.listDibbsRfqs({
      issue_date_after: "2026-01-01",
      return_by_date_before: "2026-02-01",
      set_aside: "SBA",
      ordering: "-return_by_date",
    });

    const p = params(calls);
    expect(p.get("issue_date_after")).toBe("2026-01-01");
    expect(p.get("return_by_date_before")).toBe("2026-02-01");
    expect(p.get("set_aside")).toBe("SBA");
    expect(p.get("ordering")).toBe("-return_by_date");
  });

  it("listDibbsRfqs honors an explicit shape and flat flags", async () => {
    const { client, calls } = makeClient();
    await client.listDibbsRfqs({ shape: "uuid,nsn", flat: true, flatLists: true });

    const p = params(calls);
    expect(p.get("shape")).toBe("uuid,nsn");
    expect(p.get("flat")).toBe("true");
    expect(p.get("flat_lists")).toBe("true");
  });

  it("getDibbsRfq uses the uuid route and the default minimal shape", async () => {
    const { client, calls } = makeClient({ uuid: "abc" });
    await client.getDibbsRfq("abc");

    expect(calls[0].url).toContain("/api/dibbs/rfqs/abc/");
    expect(params(calls).get("shape")).toBe(ShapeConfig.DIBBS_RFQS_MINIMAL);
  });

  it("getDibbsRfq requires uuid", async () => {
    const { client } = makeClient();
    await expect(client.getDibbsRfq("")).rejects.toThrow();
  });
});

describe("TangoClient — DIBBS RFPs", () => {
  it("listDibbsRfps hits /api/dibbs/rfps/ with filters passed through", async () => {
    const { client, calls } = makeClient();
    await client.listDibbsRfps({ buyer_code: "ABC", closes_date_after: "2026-01-01", open: true });

    expect(calls[0].url).toContain("/api/dibbs/rfps/");
    const p = params(calls);
    expect(p.get("buyer_code")).toBe("ABC");
    expect(p.get("closes_date_after")).toBe("2026-01-01");
    expect(p.get("open")).toBe("true");
    expect(p.has("is_open")).toBe(false);
    expect(p.get("shape")).toBe(ShapeConfig.DIBBS_RFPS_MINIMAL);
  });

  it("getDibbsRfp uses the uuid route", async () => {
    const { client, calls } = makeClient({ uuid: "abc" });
    await client.getDibbsRfp("abc");
    expect(calls[0].url).toContain("/api/dibbs/rfps/abc/");
    expect(params(calls).get("shape")).toBe(ShapeConfig.DIBBS_RFPS_MINIMAL);
  });

  it("getDibbsRfp requires uuid", async () => {
    const { client } = makeClient();
    await expect(client.getDibbsRfp("")).rejects.toThrow();
  });
});

describe("TangoClient — DIBBS awards", () => {
  it("listDibbsAwards hits /api/dibbs/awards/ with price bounds and pagination", async () => {
    const { client, calls } = makeClient();
    await client.listDibbsAwards({
      awardee_cage: "1ABC2",
      total_contract_price_min: 1000,
      total_contract_price_max: 50000,
      page: 3,
      limit: 50,
    });

    expect(calls[0].url).toContain("/api/dibbs/awards/");
    const p = params(calls);
    expect(p.get("awardee_cage")).toBe("1ABC2");
    expect(p.get("total_contract_price_min")).toBe("1000");
    expect(p.get("total_contract_price_max")).toBe("50000");
    expect(p.get("page")).toBe("3");
    expect(p.get("limit")).toBe("50");
    expect(p.get("shape")).toBe(ShapeConfig.DIBBS_AWARDS_MINIMAL);
  });

  it("listDibbsAwards caps limit at 100", async () => {
    const { client, calls } = makeClient();
    await client.listDibbsAwards({ limit: 500 });
    expect(params(calls).get("limit")).toBe("100");
  });

  it("getDibbsAward uses the uuid route", async () => {
    const { client, calls } = makeClient({ uuid: "abc" });
    await client.getDibbsAward("abc");
    expect(calls[0].url).toContain("/api/dibbs/awards/abc/");
    expect(params(calls).get("shape")).toBe(ShapeConfig.DIBBS_AWARDS_MINIMAL);
  });

  it("getDibbsAward requires uuid", async () => {
    const { client } = makeClient();
    await expect(client.getDibbsAward("")).rejects.toThrow();
  });
});

describe("TangoClient — exclusions", () => {
  it("listExclusions hits /api/exclusions/ with filters under API param names", async () => {
    const { client, calls } = makeClient();
    await client.listExclusions({
      uei: "ABC123DEF456",
      classification_type: "Firm",
      active: true,
      delisted: false,
      activate_date_after: "2020-01-01",
    });

    expect(calls[0].url).toContain("/api/exclusions/");
    const p = params(calls);
    expect(p.get("uei")).toBe("ABC123DEF456");
    expect(p.get("classification_type")).toBe("Firm");
    // `active` is the filter; `is_currently_excluded` is query-time derived.
    expect(p.get("active")).toBe("true");
    expect(p.has("is_currently_excluded")).toBe(false);
    expect(p.get("delisted")).toBe("false");
    expect(p.get("activate_date_after")).toBe("2020-01-01");
    expect(p.get("shape")).toBe(ShapeConfig.EXCLUSIONS_MINIMAL);
  });

  it("getExclusion uses the exclusion_key route", async () => {
    const { client, calls } = makeClient({ exclusion_key: "S4MEX-123" });
    await client.getExclusion("S4MEX-123");
    expect(calls[0].url).toContain("/api/exclusions/S4MEX-123/");
    expect(params(calls).get("shape")).toBe(ShapeConfig.EXCLUSIONS_MINIMAL);
  });

  it("getExclusion requires exclusion_key", async () => {
    const { client } = makeClient();
    await expect(client.getExclusion("")).rejects.toThrow();
  });
});

describe("TangoClient — SBIR topics", () => {
  it("listSbirTopics hits /api/sbir/topics/ with filters passed through", async () => {
    const { client, calls } = makeClient();
    await client.listSbirTopics({
      agency: "DOD",
      activity: "open",
      year: 2026,
      close_date_after: "2026-08-01",
      search: "autonomy",
    });

    expect(calls[0].url).toContain("/api/sbir/topics/");
    const p = params(calls);
    expect(p.get("agency")).toBe("DOD");
    expect(p.get("activity")).toBe("open");
    expect(p.get("year")).toBe("2026");
    expect(p.get("close_date_after")).toBe("2026-08-01");
    expect(p.get("search")).toBe("autonomy");
    expect(p.get("shape")).toBe(ShapeConfig.SBIR_TOPICS_MINIMAL);
  });

  it("getSbirTopic uses the topic_id route", async () => {
    const { client, calls } = makeClient({ topic_id: "T123" });
    await client.getSbirTopic("T123");
    expect(calls[0].url).toContain("/api/sbir/topics/T123/");
    expect(params(calls).get("shape")).toBe(ShapeConfig.SBIR_TOPICS_MINIMAL);
  });

  it("getSbirTopic requires topic_id", async () => {
    const { client } = makeClient();
    await expect(client.getSbirTopic("")).rejects.toThrow();
  });
});

describe("TangoClient — SBIR solicitations", () => {
  it("listSbirSolicitations hits /api/sbir/solicitations/ with filters passed through", async () => {
    const { client, calls } = makeClient();
    await client.listSbirSolicitations({
      program: "SBIR",
      out_of_cycle: false,
      start_date_after: "2026-01-01",
      solicitation_status: "Open",
    });

    expect(calls[0].url).toContain("/api/sbir/solicitations/");
    const p = params(calls);
    expect(p.get("program")).toBe("SBIR");
    expect(p.get("out_of_cycle")).toBe("false");
    expect(p.get("start_date_after")).toBe("2026-01-01");
    expect(p.get("solicitation_status")).toBe("Open");
    expect(p.get("shape")).toBe(ShapeConfig.SBIR_SOLICITATIONS_MINIMAL);
  });

  it("getSbirSolicitation uses the solicitation_id route", async () => {
    const { client, calls } = makeClient({ solicitation_id: "S1" });
    await client.getSbirSolicitation("S1");
    expect(calls[0].url).toContain("/api/sbir/solicitations/S1/");
    expect(params(calls).get("shape")).toBe(ShapeConfig.SBIR_SOLICITATIONS_MINIMAL);
  });

  it("getSbirSolicitation requires solicitation_id", async () => {
    const { client } = makeClient();
    await expect(client.getSbirSolicitation("")).rejects.toThrow();
  });
});

describe("TangoClient — DIBBS/exclusions/SBIR list responses", () => {
  it("listExclusions returns a materialized paginated response", async () => {
    const { client } = makeClient({
      count: 1,
      next: null,
      previous: null,
      results: [{ exclusion_key: "K1", display_name: "ACME", is_currently_excluded: true }],
    });

    const res = await client.listExclusions();
    expect(res.count).toBe(1);
    expect(res.results).toHaveLength(1);
    expect(res.results[0].exclusion_key).toBe("K1");
    expect(res.results[0].is_currently_excluded).toBe(true);
  });
});
