/**
 * Tests for the state, local and education (SLED) endpoint family.
 *
 * Covers the request contract for each method — correct path, filters passed
 * through under the API's own param names, the documented default shape — via
 * the injected fetchImpl mock. Mirrors tango-python's tests/test_sled.py.
 */

import { TangoClient } from "../../src/client.js";
import { ShapeConfig } from "../../src/config.js";
import { ShapeParser } from "../../src/shapes/parser.js";
import { SchemaRegistry } from "../../src/shapes/schema.js";
import type { FieldSpec } from "../../src/shapes/types.js";

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

describe("TangoClient — SLED solicitations", () => {
  it("listSledOpportunities hits /api/sled/opportunities/ with filters under API param names", async () => {
    const { client, calls } = makeClient();
    await client.listSledOpportunities({
      state: "TX|OK",
      jurisdiction: "local|education",
      status: "open|unknown",
      has_documents: true,
      response_deadline_before: "2026-10-01",
      limit: 10,
    });

    expect(calls[0].url).toContain("/api/sled/opportunities/");
    const p = params(calls);
    expect(p.get("state")).toBe("TX|OK");
    expect(p.get("jurisdiction")).toBe("local|education");
    expect(p.get("status")).toBe("open|unknown");
    expect(p.get("has_documents")).toBe("true");
    expect(p.get("response_deadline_before")).toBe("2026-10-01");
    expect(p.get("limit")).toBe("10");
    expect(p.get("shape")).toBe(ShapeConfig.SLED_OPPORTUNITIES_MINIMAL);
  });

  it("sends no liveness filter when the caller requests none", async () => {
    // The open-only default is the API's. Synthesizing `status=open` here would
    // make `active: false` unreachable, since it is the complement of open.
    const { client, calls } = makeClient();
    await client.listSledOpportunities();
    const p = params(calls);
    expect(p.has("status")).toBe(false);
    expect(p.has("active")).toBe(false);
  });

  it("sends active=false rather than dropping it", async () => {
    const { client, calls } = makeClient();
    await client.listSledOpportunities({ active: false });
    expect(params(calls).get("active")).toBe("false");
  });

  it("does not accept source_status as a filter", async () => {
    // `status` is Tango-derived liveness; the portal's frozen word is served but not filterable.
    const { client, calls } = makeClient();
    await client.listSledOpportunities({ status: "closed" });
    const p = params(calls);
    expect(p.get("status")).toBe("closed");
    expect(p.has("source_status")).toBe(false);
  });

  it("keeps the four category filters distinct", async () => {
    const { client, calls } = makeClient();
    await client.listSledOpportunities({
      naics: "541620",
      nigp: "962-47",
      unspsc: "77101500",
      category_code: "541620",
    });
    const p = params(calls);
    expect(p.get("naics")).toBe("541620");
    expect(p.get("nigp")).toBe("962-47");
    expect(p.get("unspsc")).toBe("77101500");
    expect(p.get("category_code")).toBe("541620");
  });

  it("getSledOpportunity uses the opportunity_id route and the comprehensive shape", async () => {
    const { client, calls } = makeClient({ opportunity_id: "abc" });
    await client.getSledOpportunity("abc");
    expect(calls[0].url).toContain("/api/sled/opportunities/abc/");
    expect(params(calls).get("shape")).toBe(ShapeConfig.SLED_OPPORTUNITIES_COMPREHENSIVE);
  });

  it("getSledOpportunity rejects an empty id before issuing a request", async () => {
    const { client, calls } = makeClient();
    await expect(client.getSledOpportunity("")).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  it("parses list results", async () => {
    const { client } = makeClient({
      count: 1,
      next: null,
      previous: null,
      results: [{ opportunity_id: "u1", title: "Environmental mitigation services", state: "TX", status: "open" }],
    });
    const page = await client.listSledOpportunities();
    expect(page.count).toBe(1);
    expect((page.results[0] as Record<string, unknown>).state).toBe("TX");
  });
});

describe("TangoClient — SLED revisions", () => {
  it("listSledOpportunityRevisions hits the nested route with filters", async () => {
    const { client, calls } = makeClient();
    await client.listSledOpportunityRevisions("abc", { kind: "deadline_change", source_declared: true });
    expect(calls[0].url).toContain("/api/sled/opportunities/abc/revisions/");
    const p = params(calls);
    expect(p.get("kind")).toBe("deadline_change");
    expect(p.get("source_declared")).toBe("true");
    expect(p.get("shape")).toBe(ShapeConfig.SLED_REVISIONS_MINIMAL);
  });

  it("reaches enrichment rows, which the revisions(*) expand excludes", async () => {
    const { client, calls } = makeClient();
    await client.listSledOpportunityRevisions("abc", { kind: "enrichment" });
    expect(params(calls).get("kind")).toBe("enrichment");
  });

  it("default revision shape omits the plan-gated changes leaf", () => {
    // `changes` needs a Small plan, so naming it by default would 403 a Free caller.
    expect(ShapeConfig.SLED_REVISIONS_MINIMAL).toContain("changed_fields");
    expect(ShapeConfig.SLED_REVISIONS_MINIMAL.split(",")).not.toContain("changes");
  });
});

describe("TangoClient — SLED coverage", () => {
  it("getSledCoverage hits the coverage route with no shape or pagination", async () => {
    const { client, calls } = makeClient({
      generated_at: "2026-09-10T14:00:00Z",
      totals: { opportunities: 3, forecasts: 1 },
      states: [{ state: "TX", total_count: 3 }],
    });
    const payload = await client.getSledCoverage();
    expect(calls[0].url).toContain("/api/sled/opportunities/coverage/");
    const p = params(calls);
    expect(p.has("shape")).toBe(false);
    expect(p.has("page")).toBe(false);
    expect((payload.totals as Record<string, unknown>).opportunities).toBe(3);
  });
});

describe("TangoClient — SLED forecasts", () => {
  it("listSledForecasts hits /api/sled/forecasts/ with filters", async () => {
    const { client, calls } = makeClient();
    await client.listSledForecasts({
      state: "MD",
      procurement_method: "Competitive Sealed Proposals",
      advertisement_after: "2026-10-01",
    });
    expect(calls[0].url).toContain("/api/sled/forecasts/");
    const p = params(calls);
    expect(p.get("state")).toBe("MD");
    expect(p.get("procurement_method")).toBe("Competitive Sealed Proposals");
    expect(p.get("advertisement_after")).toBe("2026-10-01");
    expect(p.get("shape")).toBe(ShapeConfig.SLED_FORECASTS_MINIMAL);
  });

  it("getSledForecast uses the forecast_id route", async () => {
    const { client, calls } = makeClient({ forecast_id: "f1" });
    await client.getSledForecast("f1");
    expect(calls[0].url).toContain("/api/sled/forecasts/f1/");
  });
});

describe("SLED shapes resolve against the registered schemas", () => {
  const parser = new ShapeParser();
  const registry = new SchemaRegistry();

  /** Walk every leaf and expand of a parsed shape against the model's schema. */
  function assertResolves(shape: string, modelName: string): void {
    const walk = (fields: FieldSpec[], model: string, path: string): void => {
      for (const field of fields) {
        if (field.name === "*") continue;
        const schema = registry.getSchema(model);
        const spec = schema.fields[field.name];
        expect(spec, `${path}${field.name} on ${model}`).toBeDefined();
        if (field.nestedFields?.length) {
          const nested = spec!.nestedModel;
          expect(nested, `${path}${field.name} should carry a nested schema`).toBeTruthy();
          walk(field.nestedFields, nested!, `${path}${field.name}.`);
        }
      }
    };
    walk(parser.parse(shape).fields, modelName, "");
  }

  const defaults: Array<[string, string]> = [
    [ShapeConfig.SLED_OPPORTUNITIES_MINIMAL, "SledOpportunity"],
    [ShapeConfig.SLED_OPPORTUNITIES_COMPREHENSIVE, "SledOpportunity"],
    [ShapeConfig.SLED_REVISIONS_MINIMAL, "SledOpportunityRevision"],
    [ShapeConfig.SLED_FORECASTS_MINIMAL, "SledForecast"],
    [ShapeConfig.SLED_FORECASTS_COMPREHENSIVE, "SledForecast"],
  ];

  it.each(defaults)("%s resolves against %s", (shape, model) => {
    assertResolves(shape, model);
  });

  const nested: Array<[string, string]> = [
    ["opportunity_id,organization(state,level,agency),meta(attachment_count,revision_count)", "SledOpportunity"],
    ["opportunity_id,attachments(name,size_bytes,char_count,extraction_status,is_generated_summary)", "SledOpportunity"],
    ["opportunity_id,revisions(observed_at,kind,changed_fields,changes)", "SledOpportunity"],
    ["opportunity_id,title,snippet", "SledOpportunity"],
    ["forecast_id,estimated_value(min,max,raw),contact(name,email)", "SledForecast"],
  ];

  it.each(nested)("%s resolves against %s", (shape, model) => {
    assertResolves(shape, model);
  });

  it.each(["external_id", "native_id", "platform"])("%s is a filter and never a response field", (field) => {
    expect(registry.getSchema("SledOpportunity").fields[field]).toBeUndefined();
  });
});
