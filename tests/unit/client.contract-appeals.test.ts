/**
 * Tests for the boards-of-contract-appeals endpoint (`/api/contract_appeals/`).
 *
 * Covers the request contract — correct path, filters passed through under the
 * API's own param names, the uuid detail route — via the injected fetchImpl
 * mock, plus the shape schema the SDK registers for the resource.
 */

import { TangoClient } from "../../src/client.js";
import { SchemaRegistry } from "../../src/shapes/schema.js";
import type { ContractAppealRecord } from "../../src/types.js";

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
  const client = new TangoClient({ apiKey: "k", baseUrl: "http://localhost:8000", fetchImpl, retries: 0 });
  return { client, calls };
}

function params(calls: RecordedCall[]): URLSearchParams {
  return new URL(calls[0].url).searchParams;
}

const APPEAL: ContractAppealRecord = {
  uuid: "6f1c2e70-7a64-4a19-9b0e-0f9f2a1c3d45",
  board: "cbca",
  docket_numbers: ["CBCA 7890", "CBCA 7891"],
  docket_source: "listing",
  docket_raw: "CBCA 7890, 7891",
  decision_date: "2026-04-17",
  decision_date_raw: "April 17, 2026",
  decision_date_repaired: false,
  appellant: "Meridian Construction Group",
  judge: "Sullivan",
  decision_type: "decision",
  decision_type_raw: "DECISION",
  url: "https://example.gov/decisions/cbca-7890.pdf",
  document_id: "cbca-7890-2026",
  listing_url: "https://example.gov/decisions/2026",
  listing_year: 2026,
  first_listed_at: "2026-04-18T09:12:00Z",
  listed: true,
  text_status: "extracted",
  text_char_count: 41822,
};

describe("TangoClient — contract appeals", () => {
  it("listContractAppeals hits /api/contract_appeals/ with filters under API param names", async () => {
    const { client, calls } = makeClient();
    await client.listContractAppeals({
      board: "asbca",
      docket: "ASBCA 63210",
      appellant: "Meridian Construction Group",
      judge: "Sullivan",
      decision_type: "decision",
      decision_date_after: "2026-01-01",
      decision_date_before: "2026-06-30",
      document_id: "asbca-63210-2026",
      search: "differing site conditions",
      ordering: "-decision_date",
      limit: 10,
    });

    expect(calls[0].url).toContain("/api/contract_appeals/");
    const p = params(calls);
    expect(p.get("board")).toBe("asbca");
    expect(p.get("docket")).toBe("ASBCA 63210");
    expect(p.get("appellant")).toBe("Meridian Construction Group");
    expect(p.get("judge")).toBe("Sullivan");
    expect(p.get("decision_type")).toBe("decision");
    expect(p.get("decision_date_after")).toBe("2026-01-01");
    expect(p.get("decision_date_before")).toBe("2026-06-30");
    expect(p.get("document_id")).toBe("asbca-63210-2026");
    expect(p.get("search")).toBe("differing site conditions");
    expect(p.get("ordering")).toBe("-decision_date");
    expect(p.get("limit")).toBe("10");
  });

  it("sends listed=false rather than dropping it", async () => {
    const { client, calls } = makeClient();
    await client.listContractAppeals({ listed: false });
    expect(params(calls).get("listed")).toBe("false");
  });

  it("sends no shape when the caller names none", async () => {
    // The core-subset default belongs to the API; synthesizing a shape here would pin the SDK to a field list it does not own.
    const { client, calls } = makeClient();
    await client.listContractAppeals();
    const p = params(calls);
    expect(p.has("shape")).toBe(false);
    expect(p.get("page")).toBe("1");
  });

  it("passes an explicit shape through", async () => {
    const { client, calls } = makeClient();
    await client.listContractAppeals({ shape: "uuid,board,decision_date,decision_text" });
    expect(params(calls).get("shape")).toBe("uuid,board,decision_date,decision_text");
  });

  it("parses list results", async () => {
    const { client } = makeClient({ count: 1, next: null, previous: null, results: [APPEAL] });
    const page = await client.listContractAppeals({ board: "cbca" });
    expect(page.count).toBe(1);
    const first = page.results[0] as ContractAppealRecord;
    expect(first.board).toBe("cbca");
    expect(first.docket_numbers).toEqual(["CBCA 7890", "CBCA 7891"]);
    expect(first.listing_year).toBe(2026);
  });

  it("getContractAppeal uses the uuid route", async () => {
    const { client, calls } = makeClient(APPEAL);
    const appeal = await client.getContractAppeal(APPEAL.uuid!);
    expect(calls[0].url).toContain(`/api/contract_appeals/${APPEAL.uuid!}/`);
    expect(appeal.judge).toBe("Sullivan");
    expect(appeal.decision_date_repaired).toBe(false);
  });

  it("getContractAppeal rejects an empty uuid before issuing a request", async () => {
    const { client, calls } = makeClient();
    await expect(client.getContractAppeal("")).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  it("getContractAppeal threads shape and flat", async () => {
    const { client, calls } = makeClient(APPEAL);
    await client.getContractAppeal(APPEAL.uuid!, { shape: "uuid,decision_text", flat: true, joiner: "__" });
    const p = params(calls);
    expect(p.get("shape")).toBe("uuid,decision_text");
    expect(p.get("flat")).toBe("true");
    expect(p.get("joiner")).toBe("__");
  });

  it("returns the decision body when the tier serves it", async () => {
    const { client } = makeClient({ ...APPEAL, decision_text: "The appeal is sustained." });
    const appeal = await client.getContractAppeal(APPEAL.uuid!);
    expect(appeal.decision_text).toBe("The appeal is sustained.");
  });

  it("leaves decision_text absent, not null, when the tier does not serve it", async () => {
    // Below Enterprise the key is missing entirely, so a caller must test for presence rather than for a nullish value.
    const { client } = makeClient(APPEAL);
    const appeal = await client.getContractAppeal(APPEAL.uuid!);
    expect("decision_text" in appeal).toBe(false);
  });
});

describe("ContractAppeal shape schema", () => {
  const registry = new SchemaRegistry();

  it.each(Object.keys(APPEAL).concat("decision_text"))("%s is a known field", (field) => {
    expect(registry.getSchema("ContractAppeal").fields[field]).toBeDefined();
  });

  it("docket_numbers is a list of scalars", () => {
    const spec = registry.getField("ContractAppeal", "docket_numbers");
    expect(spec.isList).toBe(true);
    expect(spec.nestedModel).toBeNull();
  });

  it.each(["docket", "search"])("%s is a filter and never a response field", (field) => {
    expect(registry.getSchema("ContractAppeal").fields[field]).toBeUndefined();
  });
});
