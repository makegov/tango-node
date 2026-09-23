/**
 * Fields the API serves that the client-side shape validator must accept.
 *
 * Each case shapes a real API field through the public client against a stubbed response, so a schema that lags the API fails here with `ShapeValidationError` instead of in a user's code.
 */

import { TangoClient } from "../../src/client.js";

type RecordedCall = { url: string };

function makeClient(body: unknown): { client: TangoClient; calls: RecordedCall[] } {
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

const ATTACHMENTS_SHAPE = "title,attachments(name,doc_role,doc_role_alt)";

const ATTACHMENTS = [
  { name: "Performance Work Statement.pdf", doc_role: "requirement", doc_role_alt: "terms" },
  { name: "Pricing Sheet.xlsx", doc_role: "pricing", doc_role_alt: null },
];

function page(record: Record<string, unknown>): Record<string, unknown> {
  return { count: 1, next: null, previous: null, results: [record] };
}

describe("attachment document roles on opportunities and notices", () => {
  it("getOpportunity shapes attachments(name,doc_role,doc_role_alt)", async () => {
    const { client, calls } = makeClient({ title: "Base ops", attachments: ATTACHMENTS });
    const opp = await client.getOpportunity("opp-1", { shape: ATTACHMENTS_SHAPE });

    expect(new URL(calls[0].url).searchParams.get("shape")).toBe(ATTACHMENTS_SHAPE);
    expect(opp.attachments).toEqual(ATTACHMENTS);
  });

  it("listOpportunities shapes attachments(name,doc_role,doc_role_alt)", async () => {
    const { client } = makeClient(page({ title: "Base ops", attachments: ATTACHMENTS }));
    const resp = await client.listOpportunities({ shape: ATTACHMENTS_SHAPE });

    expect(resp.results[0].attachments).toEqual(ATTACHMENTS);
  });

  it("getNotice shapes attachments(name,doc_role,doc_role_alt)", async () => {
    const { client } = makeClient({ title: "Base ops", attachments: ATTACHMENTS });
    const notice = await client.getNotice("notice-1", { shape: ATTACHMENTS_SHAPE });

    expect(notice.attachments).toEqual(ATTACHMENTS);
  });

  it("listNotices shapes attachments(name,doc_role,doc_role_alt)", async () => {
    const { client } = makeClient(page({ title: "Base ops", attachments: ATTACHMENTS }));
    const resp = await client.listNotices({ shape: ATTACHMENTS_SHAPE });

    expect(resp.results[0].attachments).toEqual(ATTACHMENTS);
  });
});

describe("SLED delisting and jurisdiction provenance", () => {
  const SHAPE = "opportunity_id,status,status_reason,delisted_at,meta(attachment_count,jurisdiction_declared)";
  const RECORD = {
    opportunity_id: "sled-1",
    status: "closed",
    status_reason: "delisted",
    delisted_at: "2026-09-12T14:03:00Z",
    meta: { attachment_count: 2, jurisdiction_declared: false },
  };

  it("listSledOpportunities shapes delisted_at and meta(jurisdiction_declared)", async () => {
    const { client } = makeClient(page(RECORD));
    const resp = await client.listSledOpportunities({ shape: SHAPE });
    const row = resp.results[0] as Record<string, unknown>;

    expect(row.status_reason).toBe("delisted");
    expect(row.delisted_at).toEqual(new Date("2026-09-12T14:03:00Z"));
    expect(row.meta).toEqual({ attachment_count: 2, jurisdiction_declared: false });
  });

  it("getSledOpportunity shapes delisted_at and meta(jurisdiction_declared)", async () => {
    const { client } = makeClient(RECORD);
    const row = await client.getSledOpportunity("sled-1", { shape: SHAPE });

    expect(row.delisted_at).toEqual(new Date("2026-09-12T14:03:00Z"));
    expect((row.meta as Record<string, unknown>).jurisdiction_declared).toBe(false);
  });
});
