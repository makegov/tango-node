/**
 * Tests for the financial-assistance award endpoints (`/api/assistance/{grants,loans,direct_payments,other}/`).
 *
 * Covers the request contract via the injected fetchImpl mock — paths, filters under the API's own param names, cursor pagination on the lists, page pagination on the sub-routes — plus the shape schema the SDK registers for `AssistanceAward`.
 */

import { readFileSync } from "node:fs";
import { TangoClient } from "../../src/client.js";
import type { ListAssistanceAwardsOptions } from "../../src/client.js";
import { ShapeConfig } from "../../src/config.js";
import type { AssistanceAward, AssistanceTransaction } from "../../src/models/index.js";
import { SchemaRegistry } from "../../src/shapes/schema.js";

type RecordedCall = { url: string };

const EMPTY_PAGE = { count: 0, next: null, previous: null, results: [] };

function makeClient(...bodies: unknown[]): { client: TangoClient; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const fetchImpl = (async (url: string | URL) => {
    calls.push({ url: String(url) });
    const body = bodies.length > 1 ? bodies[calls.length - 1] : (bodies[0] ?? EMPTY_PAGE);
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify(body);
      },
    };
  }) as unknown as typeof fetch;
  const client = new TangoClient({ apiKey: "k", baseUrl: "http://localhost:8000", fetchImpl, retries: 0 });
  return { client, calls };
}

function url(calls: RecordedCall[], i = 0): URL {
  return new URL(calls[i].url);
}

const KEY = "ASST_NON_693JF72440048_069";

const AWARD: AssistanceAward = {
  key: KEY,
  fain: "693JF72440048",
  uri: null,
  award_date: "2026-10-16",
  fiscal_year: 2027,
  assistance_type: { code: "F001", description: "Grant" },
  record_type: "2",
  cfda_number: "20.933",
  assistance_listing: { number: "20.933", title: "National Infrastructure Investments" },
  title: "AWARD PURPOSE THE PROJECT FUNDS THE FULL ENGINEERING",
  obligated: 2003532.0,
  pragmatic_obligations: 2003532.0,
  face_value_of_loan: 0.0,
  loan_subsidy_cost: 0.0,
  awarding_office: { organization_id: "261f885d-c8b6-5e0d-b2f8-e0799a4e1de2", office_code: "69A334", office_name: "MARITIME ADMINISTRATION" },
  funding_office: { organization_id: "261f885d-c8b6-5e0d-b2f8-e0799a4e1de2", office_code: "69A334", office_name: "MARITIME ADMINISTRATION" },
  recipient: {
    uuid: "510bd6cc-9840-5adb-98d1-d8e5f74dff6b",
    uei: "EKPQAJKKV549",
    duns: null,
    legal_business_name: "CITY OF CRISFIELD",
    highest_owner: { uei: null, duns: null, legal_business_name: null, legal_business_name_raw: "CITY OF CRISFIELD" },
    business_types: [{ code: "A", description: "State Government" }],
  },
  place_of_performance: { country: "USA", state_code: "MD", city_name: "CRISFIELD", zip_code: "21817" },
  period_of_performance: { start_date: "2026-10-16", current_end_date: "2028-08-31" },
};

const TRANSACTION: AssistanceTransaction = {
  key: "6938_693JF72440048_-NONE-_20.933_-NONE-",
  modification_number: null,
  transaction_date: "2026-10-16",
  action_type: "A1",
  obligated: 2003532.0,
  action_date_fiscal_year: "2027",
  last_modified_date: "2026-10-19T17:21:07Z",
};

const GROUPS = [
  {
    group: "grants",
    list: "listAssistanceGrants",
    get: "getAssistanceGrant",
    tx: "listAssistanceGrantTransactions",
    listings: "listAssistanceGrantListings",
  },
  {
    group: "loans",
    list: "listAssistanceLoans",
    get: "getAssistanceLoan",
    tx: "listAssistanceLoanTransactions",
    listings: "listAssistanceLoanListings",
  },
  {
    group: "direct_payments",
    list: "listAssistanceDirectPayments",
    get: "getAssistanceDirectPayment",
    tx: "listAssistanceDirectPaymentTransactions",
    listings: "listAssistanceDirectPaymentListings",
  },
  {
    group: "other",
    list: "listAssistanceOther",
    get: "getAssistanceOther",
    tx: "listAssistanceOtherTransactions",
    listings: "listAssistanceOtherListings",
  },
] as const;

type AnyMethod = (...args: unknown[]) => Promise<Record<string, unknown>>;

function method(client: TangoClient, name: string): AnyMethod {
  return (client as unknown as Record<string, AnyMethod>)[name].bind(client);
}

const ALL_FILTERS: ListAssistanceAwardsOptions = {
  key: "K1|K2",
  fain: "693JF72440048",
  uri: "URI-1",
  funding_opportunity_number: "MAPID24001",
  uei: "EKPQAJKKV549|HS97F2C9NME3",
  recipient: "crisfield",
  awarding_agency: "DOT",
  funding_agency: "069",
  cfda_number: "20.933|93.778",
  assistance_type: "F001",
  record_type: "2|3",
  business_funds_indicator: "NON",
  disaster_emergency_fund_code: "L",
  award_date: "2026-10-16",
  award_date_gte: "2026-01-01",
  award_date_lte: "2026-12-31",
  fiscal_year: 2027,
  fiscal_year_gte: 2020,
  fiscal_year_lte: "2027",
  pop_start_date_gte: "2026-01-01",
  pop_start_date_lte: "2026-12-31",
  pop_end_date_gte: "2027-01-01",
  pop_end_date_lte: "2029-12-31",
  pop_state: "MD|VA",
  pop_country: "USA",
  pop_zip: "21817",
  obligated_gte: 100000,
  obligated_lte: "5000000.50",
  search: "dock replacement",
  ordering: "-pragmatic_obligations",
};

describe("TangoClient: assistance award lists", () => {
  it("listAssistanceGrants sends every filter under the API's param name", async () => {
    const { client, calls } = makeClient();
    await client.listAssistanceGrants({ ...ALL_FILTERS, limit: 10 });

    const p = url(calls).searchParams;
    expect(Object.fromEntries([...p.entries()].filter(([k]) => !["limit", "shape"].includes(k)))).toEqual({
      ...Object.fromEntries(Object.entries(ALL_FILTERS).map(([k, v]) => [k, String(v)])),
    });
    expect(p.get("limit")).toBe("10");
  });

  it.each(GROUPS)("$list hits /api/assistance/$group/ with the API's default shape", async ({ group, list }) => {
    const { client, calls } = makeClient();
    await method(client, list)();

    expect(url(calls).pathname).toBe(`/api/assistance/${group}/`);
    expect(url(calls).searchParams.get("shape")).toBe(ShapeConfig.ASSISTANCE_AWARDS_MINIMAL);
    expect(url(calls).searchParams.get("limit")).toBe("25");
  });

  it("forwards the cursor and never sends page, since the lists are keyset-only", async () => {
    const { client, calls } = makeClient();
    await client.listAssistanceLoans({ cursor: "WyIyMDI2LTEwLTE2Il0", page: 3, limit: 500 });

    const p = url(calls).searchParams;
    expect(p.get("cursor")).toBe("WyIyMDI2LTEwLTE2Il0");
    expect(p.has("page")).toBe(false);
    expect(p.get("limit")).toBe("100");
  });

  it("drops null and undefined filters instead of sending them", async () => {
    const { client, calls } = makeClient();
    await client.listAssistanceOther({ pop_state: undefined, uei: null as unknown as string, cfda_number: "10.703" });

    const p = url(calls).searchParams;
    expect(p.has("pop_state")).toBe(false);
    expect(p.has("uei")).toBe(false);
    expect(p.get("cfda_number")).toBe("10.703");
  });

  it("materializes the default shape: dates parsed, money as decimal strings, nested objects kept", async () => {
    const next = "http://localhost:8000/api/assistance/grants/?limit=25&cursor=WyIyMDI2LTEwLTE2Il0";
    const { client } = makeClient({ count: 5759909, next, previous: null, results: [AWARD] });
    const page = await client.listAssistanceGrants();
    const row = page.results[0];

    expect(page.cursor).toBe("WyIyMDI2LTEwLTE2Il0");
    expect(row.key).toBe(KEY);
    expect(row.award_date).toEqual(new Date("2026-10-16"));
    expect(row.obligated).toBe("2003532");
    expect(row.face_value_of_loan).toBe("0");
    expect(row.assistance_type).toEqual({ code: "F001", description: "Grant" });
    expect(row.period_of_performance).toEqual({ start_date: new Date("2026-10-16"), current_end_date: new Date("2028-08-31") });
    expect(row.recipient).toMatchObject({ uei: "EKPQAJKKV549", business_types: [{ code: "A", description: "State Government" }] });
    expect((row.recipient as Record<string, unknown>).highest_owner).toEqual(AWARD.recipient?.highest_owner);
  });

  it("sends flat and joiner together and unflattens the response", async () => {
    const { client, calls } = makeClient({
      count: 1,
      next: null,
      previous: null,
      results: [{ key: KEY, recipient__uei: "EKPQAJKKV549" }],
    });
    const page = await client.listAssistanceDirectPayments({ shape: "key,recipient(uei)", flat: true, joiner: "__" });

    const p = url(calls).searchParams;
    expect(p.get("flat")).toBe("true");
    expect(p.get("joiner")).toBe("__");
    expect(page.results[0]).toEqual({ key: KEY, recipient: { uei: "EKPQAJKKV549" } });
  });

  it("rejects a contract field the AssistanceAward schema doesn't have", async () => {
    const { client } = makeClient({ count: 1, next: null, previous: null, results: [{ key: KEY }] });
    await expect(client.listAssistanceGrants({ shape: "key,piid" })).rejects.toThrow("piid");
  });

  it("iterateAssistanceLoans follows the cursor across pages", async () => {
    const base = "http://localhost:8000/api/assistance/loans/";
    const { client, calls } = makeClient(
      { count: 3, next: `${base}?limit=2&cursor=C2`, previous: null, results: [{ key: "L1" }, { key: "L2" }] },
      { count: 3, next: null, previous: `${base}?limit=2&cursor=C1`, results: [{ key: "L3" }] },
    );

    const keys: unknown[] = [];
    for await (const award of client.iterateAssistanceLoans({ limit: 2, pop_state: "TX", shape: "key" })) keys.push(award.key);

    expect(keys).toEqual(["L1", "L2", "L3"]);
    expect(url(calls, 1).searchParams.get("cursor")).toBe("C2");
    expect(url(calls, 1).searchParams.get("pop_state")).toBe("TX");
  });
});

describe("TangoClient: assistance award detail and sub-routes", () => {
  it.each(GROUPS)("$get uses /api/assistance/$group/{key}/ with the default shape", async ({ group, get }) => {
    const { client, calls } = makeClient(AWARD);
    const award = await method(client, get)(KEY);

    expect(url(calls).pathname).toBe(`/api/assistance/${group}/${KEY}/`);
    expect(url(calls).searchParams.get("shape")).toBe(ShapeConfig.ASSISTANCE_AWARDS_MINIMAL);
    expect(award.key).toBe(KEY);
  });

  it("parses the transactions expand, keeping action_date_fiscal_year as served", async () => {
    const { client } = makeClient({ key: KEY, transactions: [TRANSACTION] });
    const award = await client.getAssistanceGrant(KEY, { shape: "key,transactions(*)" });
    const tx = (award.transactions as Array<Record<string, unknown>>)[0];

    expect(tx.transaction_date).toEqual(new Date("2026-10-16"));
    expect(tx.last_modified_date).toEqual(new Date("2026-10-19T17:21:07Z"));
    expect(tx.obligated).toBe("2003532");
    expect(tx.action_date_fiscal_year).toBe("2027");
  });

  it("URL-encodes the key", async () => {
    const { client, calls } = makeClient(AWARD);
    await client.getAssistanceOther("A/B C");
    expect(url(calls).pathname).toBe("/api/assistance/other/A%2FB%20C/");
  });

  it.each(GROUPS)("$tx pages /api/assistance/$group/{key}/transactions/ at 100 by default, capped at 500", async ({ group, tx }) => {
    const body = { count: 1, next: null, previous: null, results: [{ ...TRANSACTION, action_date_fiscal_year: 2027 }] };
    const { client, calls } = makeClient(body, body);
    const page = await method(client, tx)(KEY);
    await method(client, tx)(KEY, { page: 2, limit: 1000 });

    expect(url(calls).pathname).toBe(`/api/assistance/${group}/${KEY}/transactions/`);
    expect(Object.fromEntries(url(calls).searchParams)).toEqual({ page: "1", limit: "100" });
    expect(Object.fromEntries(url(calls, 1).searchParams)).toEqual({ page: "2", limit: "500" });
    expect((page.results as AssistanceTransaction[])[0]).toEqual({ ...TRANSACTION, action_date_fiscal_year: 2027 });
  });

  it.each(GROUPS)("$listings pages /api/assistance/$group/{key}/listings/, capped at 100", async ({ group, listings }) => {
    const row = { cfda_number: "20.933", is_primary: true, obligated: 2003532.0, transactions_count: 1, first_action_date: "2026-10-16" };
    const body = { count: 1, next: null, previous: null, results: [row] };
    const { client, calls } = makeClient(body, body);
    const page = await method(client, listings)(KEY);
    await method(client, listings)(KEY, { limit: 250 });

    expect(url(calls).pathname).toBe(`/api/assistance/${group}/${KEY}/listings/`);
    expect(Object.fromEntries(url(calls).searchParams)).toEqual({ page: "1", limit: "25" });
    expect(url(calls, 1).searchParams.get("limit")).toBe("100");
    expect(page.results).toEqual([row]);
  });

  it.each(GROUPS.flatMap(({ get, tx, listings }) => [get, tx, listings]))("%s rejects an empty key before issuing a request", async (name) => {
    const { client, calls } = makeClient();
    await expect(method(client, name)("")).rejects.toThrow("Assistance award key is required");
    expect(calls).toHaveLength(0);
  });
});

describe("AssistanceAward shape schema", () => {
  const registry = new SchemaRegistry();
  const contract = JSON.parse(readFileSync(new URL("../../contracts/filter_shape_contract.json", import.meta.url), "utf8"));
  const shape = contract.resources["assistance/grants"].runtime.shape as { fields: string[]; expands: Record<string, { fields: string[] }> };

  it("the vendored contract publishes all four groups with one shape", () => {
    expect(shape.fields.length).toBeGreaterThanOrEqual(45);
    expect(Object.keys(shape.expands)).toContain("recipient_address");
    for (const group of ["loans", "direct_payments", "other"]) {
      expect(contract.resources[`assistance/${group}`].runtime.shape).toEqual(shape);
    }
  });

  it("knows every field and expand the contract serves", () => {
    const known = registry.getSchema("AssistanceAward").fields;
    expect([...shape.fields, ...Object.keys(shape.expands)].filter((field) => known[field] === undefined)).toEqual([]);
    for (const [expand, node] of Object.entries(shape.expands)) {
      const nested = known[expand].nestedModel as string;
      const nestedFields = registry.getSchema(nested).fields;
      expect(
        node.fields.filter((field) => nestedFields[field] === undefined),
        `${expand} -> ${nested}`,
      ).toEqual([]);
    }
  });

  it("the default shape is exactly the API's own default", () => {
    expect(ShapeConfig.ASSISTANCE_AWARDS_MINIMAL).toBe(
      "key,fain,uri,award_date,fiscal_year,assistance_type(code,description),record_type,cfda_number,assistance_listing(number,title),title," +
        "obligated,pragmatic_obligations,face_value_of_loan,loan_subsidy_cost,awarding_office(*),funding_office(*),recipient(*)," +
        "place_of_performance(*),period_of_performance(start_date,current_end_date)",
    );
  });

  it.each(["listings", "transactions", "obligations_by_fiscal_year"])("%s is a list", (field) => {
    expect(registry.getField("AssistanceAward", field).isList).toBe(true);
  });
});
