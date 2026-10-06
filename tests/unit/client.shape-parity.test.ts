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

describe("attachment file and link counts (Tango API 5.9.0)", () => {
  const OPPORTUNITY_SHAPE = "opportunity_id,meta(attachments_count,files_count,links_count)";
  const NOTICE_SHAPE = "notice_id,attachment_count,file_count,link_count";

  it("getOpportunity shapes meta(files_count,links_count) beside attachments_count", async () => {
    const record = { opportunity_id: "opp-1", meta: { attachments_count: 6, files_count: 4, links_count: 1 } };
    const { client, calls } = makeClient(record);
    const opp = await client.getOpportunity("opp-1", { shape: OPPORTUNITY_SHAPE });

    expect(new URL(calls[0].url).searchParams.get("shape")).toBe(OPPORTUNITY_SHAPE);
    expect(opp.meta).toEqual({ attachments_count: 6, files_count: 4, links_count: 1 });
  });

  it("listOpportunities keeps an uncounted opportunity's counts null rather than zero", async () => {
    const record = { opportunity_id: "opp-2", meta: { attachments_count: 3, files_count: null, links_count: null } };
    const { client } = makeClient(page(record));
    const resp = await client.listOpportunities({ shape: OPPORTUNITY_SHAPE });

    expect(resp.results[0].meta).toEqual({ attachments_count: 3, files_count: null, links_count: null });
  });

  it("getNotice shapes file_count and link_count beside attachment_count", async () => {
    const record = { notice_id: "notice-1", attachment_count: 6, file_count: 4, link_count: 1 };
    const { client, calls } = makeClient(record);
    const notice = await client.getNotice("notice-1", { shape: NOTICE_SHAPE });

    expect(new URL(calls[0].url).searchParams.get("shape")).toBe(NOTICE_SHAPE);
    expect(notice).toMatchObject(record);
  });

  it("listNotices keeps an uncounted notice's counts null rather than zero", async () => {
    const record = { notice_id: "notice-2", attachment_count: 3, file_count: null, link_count: null };
    const { client } = makeClient(page(record));
    const resp = await client.listNotices({ shape: NOTICE_SHAPE });

    expect(resp.results[0]).toMatchObject(record);
  });
});

describe("fields the API added between 5.3.0 and 5.8.0", () => {
  it("listOpportunities shapes the award leaves and the awards expand", async () => {
    const shape = "opportunity_id,awarded,award_count,awardee_uei,awards(award_number,award_date,awardee_uei)";
    const record = {
      opportunity_id: "opp-1",
      awarded: true,
      award_count: 2,
      awardee_uei: "ABCDEFGHJKL1",
      awards: [
        { award_number: "W912DY26C0001", award_date: "2026-05-04", awardee_uei: "ABCDEFGHJKL1" },
        { award_number: "W912DY26C0002", award_date: "2026-05-11", awardee_uei: "ZYXWVUTSRQP9" },
      ],
    };
    const { client } = makeClient(page(record));
    const row = (await client.listOpportunities({ shape })).results[0];

    expect(row.awarded).toBe(true);
    expect(row.award_count).toBe(2);
    expect(row.awards).toEqual([
      { award_number: "W912DY26C0001", award_date: new Date("2026-05-04"), awardee_uei: "ABCDEFGHJKL1" },
      { award_number: "W912DY26C0002", award_date: new Date("2026-05-11"), awardee_uei: "ZYXWVUTSRQP9" },
    ]);
  });

  it.each([
    ["listExclusions", "exclusion_key,organization_id,organization(agency_name,department_name)"],
    ["listSbirTopics", "topic_id,cycle_name,organization(agency_code,agency_name)"],
    ["listSbirSolicitations", "solicitation_id,organization(organization_id,agency_name)"],
    ["listVehicles", "uuid,holder_count,order_winner_count"],
  ] as const)("%s accepts %s", async (method, shape) => {
    const { client, calls } = makeClient(page({}));
    await client[method]({ shape });

    expect(new URL(calls[0].url).searchParams.get("shape")).toBe(shape);
  });
});
