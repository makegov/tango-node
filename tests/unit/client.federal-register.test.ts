/**
 * Tests for the Federal Register endpoint (`/api/federal_register/`).
 *
 * Covers the request contract (path, filters under the API's own param names, default shapes, the uuid detail route) via the injected fetchImpl mock, plus the shape schema the SDK registers for the resource.
 */

import { readFileSync } from "node:fs";
import { TangoClient } from "../../src/client.js";
import { ShapeConfig } from "../../src/config.js";
import type { FederalRegisterDocument } from "../../src/models/index.js";
import { SchemaRegistry } from "../../src/shapes/schema.js";

type RecordedCall = { url: string };

function makeClient(body: unknown = { count: 0, next: null, previous: null, results: [] }): { client: TangoClient; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const fetchImpl = (async (url: string | URL) => {
    calls.push({ url: String(url) });
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

function params(calls: RecordedCall[]): URLSearchParams {
  return new URL(calls[0].url).searchParams;
}

const UUID = "0b9d2c1e-5f4a-4c8b-9a37-2d6e8f1a4b90";

const DOCUMENT: FederalRegisterDocument = {
  uuid: UUID,
  document_number: "2026-04117",
  publication_date: "2026-03-02",
  type: "Proposed Rule",
  subtype: null,
  title: "Air Plan Approval; Example State; Regional Haze",
  abstract: "The agency proposes to approve a revision to the state implementation plan.",
  action: "Proposed rule.",
  agencies: [{ name: "Environmental Protection Agency", slug: "environmental-protection-agency" }],
  cfr_references: [{ title: 40, part: 52 }],
  citation: "91 FR 10234",
  significant: false,
  comments_close_on: "2026-04-01",
  effective_on: null,
  html_url: "https://example.gov/documents/2026-04117",
  pdf_url: "https://example.gov/documents/2026-04117.pdf",
};

describe("TangoClient: Federal Register documents", () => {
  it("listFederalRegisterDocuments sends every filter under the API's param name", async () => {
    const { client, calls } = makeClient();
    await client.listFederalRegisterDocuments({
      search: '"regional haze"',
      document_number: "2026-04117|2016-31922",
      type: "Proposed Rule",
      agency: "EPA",
      fr_agency: "environmental-protection-agency",
      publication_date_after: "2026-01-01",
      publication_date_before: "2026-06-30",
      effective_on_after: "2026-02-01",
      effective_on_before: "2026-07-31",
      comments_close_on_after: "2026-03-01",
      comments_close_on_before: "2026-08-31",
      comments_open: true,
      cfr_title: 40,
      cfr_part: "52",
      significant: true,
      rin: "2060-AV16",
      executive_order_number: "14110",
      ordering: "-comments_close_on",
      limit: 10,
    });

    expect(new URL(calls[0].url).pathname).toBe("/api/federal_register/");
    const p = params(calls);
    expect(Object.fromEntries([...p.entries()].filter(([k]) => !["page", "limit", "shape"].includes(k)))).toEqual({
      search: '"regional haze"',
      document_number: "2026-04117|2016-31922",
      type: "Proposed Rule",
      agency: "EPA",
      fr_agency: "environmental-protection-agency",
      publication_date_after: "2026-01-01",
      publication_date_before: "2026-06-30",
      effective_on_after: "2026-02-01",
      effective_on_before: "2026-07-31",
      comments_close_on_after: "2026-03-01",
      comments_close_on_before: "2026-08-31",
      comments_open: "true",
      cfr_title: "40",
      cfr_part: "52",
      significant: "true",
      rin: "2060-AV16",
      executive_order_number: "14110",
      ordering: "-comments_close_on",
    });
    expect(p.get("limit")).toBe("10");
  });

  it("sends comments_open=false and significant=false rather than dropping them", async () => {
    const { client, calls } = makeClient();
    await client.listFederalRegisterDocuments({ comments_open: false, significant: false });
    expect(params(calls).get("comments_open")).toBe("false");
    expect(params(calls).get("significant")).toBe("false");
  });

  it("defaults the list to FEDERAL_REGISTER_MINIMAL", async () => {
    const { client, calls } = makeClient();
    await client.listFederalRegisterDocuments();
    expect(params(calls).get("shape")).toBe(ShapeConfig.FEDERAL_REGISTER_MINIMAL);
  });

  it("parses dates and keeps the Federal Register's own structures as served", async () => {
    const { client } = makeClient({ count: 1, next: null, previous: null, results: [DOCUMENT] });
    const page = await client.listFederalRegisterDocuments({ type: "Proposed Rule" });
    const row = page.results[0];

    expect(page.count).toBe(1);
    expect(row.document_number).toBe("2026-04117");
    expect(row.publication_date).toEqual(new Date("2026-03-02"));
    expect(row.comments_close_on).toEqual(new Date("2026-04-01"));
    expect(row.effective_on).toBeNull();
    expect(row.significant).toBe(false);
    expect(row.agencies).toEqual(DOCUMENT.agencies);
    expect(row.cfr_references).toEqual(DOCUMENT.cfr_references);
  });

  it("getFederalRegisterDocument uses the uuid route and the comprehensive default", async () => {
    const { client, calls } = makeClient(DOCUMENT);
    const doc = await client.getFederalRegisterDocument(UUID);

    expect(new URL(calls[0].url).pathname).toBe(`/api/federal_register/${UUID}/`);
    expect(params(calls).get("shape")).toBe(ShapeConfig.FEDERAL_REGISTER_COMPREHENSIVE);
    expect(doc.title).toBe(DOCUMENT.title);
  });

  it("getFederalRegisterDocument accepts full_text when the shape names it", async () => {
    const { client, calls } = makeClient({ uuid: UUID, title: DOCUMENT.title, full_text: "ENVIRONMENTAL PROTECTION AGENCY ..." });
    const doc = await client.getFederalRegisterDocument(UUID, { shape: "uuid,title,full_text" });

    expect(params(calls).get("shape")).toBe("uuid,title,full_text");
    expect(doc.full_text).toBe("ENVIRONMENTAL PROTECTION AGENCY ...");
  });

  it("getFederalRegisterDocument rejects an empty uuid before issuing a request", async () => {
    const { client, calls } = makeClient(DOCUMENT);
    await expect(client.getFederalRegisterDocument("")).rejects.toThrow("uuid is required");
    expect(calls).toHaveLength(0);
  });
});

describe("FederalRegisterDocument shape schema", () => {
  const registry = new SchemaRegistry();
  const contract = JSON.parse(readFileSync(new URL("../../contracts/filter_shape_contract.json", import.meta.url), "utf8"));
  const contractFields: string[] = contract.resources.federal_register.runtime.shape.fields;

  it("the vendored contract lists the resource's shape fields", () => {
    expect(contractFields.length).toBeGreaterThanOrEqual(43);
    expect(contractFields).toContain("regulation_id_numbers");
  });

  it("knows every field the contract serves, plus the detail-only full_text", () => {
    const known = registry.getSchema("FederalRegisterDocument").fields;
    expect(contractFields.concat("full_text").filter((field) => known[field] === undefined)).toEqual([]);
  });

  it.each(["FEDERAL_REGISTER_MINIMAL", "FEDERAL_REGISTER_COMPREHENSIVE"] as const)("%s names only fields the contract serves", (preset) => {
    expect(ShapeConfig[preset].split(",").filter((field) => !contractFields.includes(field))).toEqual([]);
  });

  it("neither default shape asks for full_text", () => {
    expect(ShapeConfig.FEDERAL_REGISTER_MINIMAL.split(",")).not.toContain("full_text");
    expect(ShapeConfig.FEDERAL_REGISTER_COMPREHENSIVE.split(",")).not.toContain("full_text");
  });

  it.each(["agencies", "cfr_references", "dockets", "docket_ids", "topics", "regulation_id_numbers", "corrections"])("%s is a list", (field) => {
    expect(registry.getField("FederalRegisterDocument", field).isList).toBe(true);
  });

  it.each(["agency", "fr_agency", "rin", "comments_open"])("%s is a filter and never a response field", (field) => {
    expect(registry.getSchema("FederalRegisterDocument").fields[field]).toBeUndefined();
  });
});
