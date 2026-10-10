/**
 * Tests for the GSA eBuy endpoints (`/api/ebuy/requests/` and `/api/ebuy/access/`).
 *
 * Mocked transport only: eBuy data is scoped to the caller's own schedule contracts, so it is never recorded into a cassette.
 */

import { TangoClient } from "../../src/client.js";
import { TangoEbuyAttachmentLinkError, TangoNotFoundError, TangoValidationError } from "../../src/errors.js";
import { SchemaRegistry } from "../../src/shapes/schema.js";
import type { EbuyAccess, EbuyRequestRecord } from "../../src/types.js";

type RecordedCall = { url: string; init?: RequestInit | undefined };

interface MockResponse {
  status?: number;
  headers?: Record<string, string>;
  body?: unknown;
}

function makeClient(response: MockResponse = {}): { client: TangoClient; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const { status = 200, headers = {}, body = { count: 0, next: null, previous: null, results: [] } } = response;
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: new Headers(headers),
      async text() {
        return body === undefined ? "" : JSON.stringify(body);
      },
    };
  }) as unknown as typeof fetch;
  const client = new TangoClient({ apiKey: "k", baseUrl: "http://localhost:8000", fetchImpl, retries: 0 });
  return { client, calls };
}

function params(calls: RecordedCall[]): URLSearchParams {
  return new URL(calls[0].url).searchParams;
}

const REQUEST: EbuyRequestRecord = {
  rfq_id: "RFQ1835158",
  request_type: "RFQ",
  title: "Cloud migration support",
  schedule: "MAS",
  sin: "54151S",
  status: "Open",
  buyer_name: "Jane Buyer",
  buyer_agency: "Department of Veterans Affairs",
  buyer_agency_code: "36",
  reference_number: "36C10B26Q0012",
  issue_date: "2026-09-01T16:58:02+00:00",
  close_date: "2026-10-01T16:00:00+00:00",
  attachment_count: 2,
  link_count: 1,
  last_seen: "2026-09-28T18:31:08+00:00",
};

const DETAIL: EbuyRequestRecord = {
  ...REQUEST,
  description: "Migrate three workloads.",
  detail_fetched: true,
  first_seen: "2026-09-01T17:00:00+00:00",
  follow_on: false,
  mod_version: null,
  amendments: [],
  line_items: [],
  addresses: [],
  organization: { organization_id: "00000000-0000-0000-0000-000000000036", office_code: "36C10B", office_name: "Technology Acquisition Center" },
  attachments: [
    { doc_seq_num: 3852759, doc_name: "sow.pdf", doc_type: 1, doc_path: "sow.pdf", is_link: false, doc_session_date: "2026-09-01T16:58:02+00:00" },
    { doc_seq_num: 3852760, doc_name: "Portal", doc_type: 2, doc_path: "https://example.gov/portal", is_link: true, doc_session_date: null },
  ],
};

describe("TangoClient — eBuy requests", () => {
  it("listEbuyRequests hits /api/ebuy/requests/ with filters under API param names", async () => {
    const { client, calls } = makeClient();
    await client.listEbuyRequests({
      search: "cybersecurity assessment",
      rfq_id: "RFQ1835158",
      reference_number: "W912DY-26-Q-0012",
      request_type: "RFQ|RFP",
      status: "Open",
      sin: "54151S",
      schedule: "MAS",
      buyer_agency: "Department of Veterans Affairs",
      agency: "VA",
      contract_number: "CONTRACT-1",
      issue_date_after: "2026-01-01",
      issue_date_before: "2026-06-30",
      close_date_after: "2026-07-01",
      close_date_before: "2026-12-31",
      ordering: "-close_date",
      limit: 10,
    });

    expect(new URL(calls[0].url).pathname).toBe("/api/ebuy/requests/");
    const p = params(calls);
    expect(Object.fromEntries(p.entries())).toEqual({
      page: "1",
      limit: "10",
      search: "cybersecurity assessment",
      rfq_id: "RFQ1835158",
      reference_number: "W912DY-26-Q-0012",
      request_type: "RFQ|RFP",
      status: "Open",
      sin: "54151S",
      schedule: "MAS",
      buyer_agency: "Department of Veterans Affairs",
      agency: "VA",
      contract_number: "CONTRACT-1",
      issue_date_after: "2026-01-01",
      issue_date_before: "2026-06-30",
      close_date_after: "2026-07-01",
      close_date_before: "2026-12-31",
      ordering: "-close_date",
    });
  });

  it("sends no shape when the caller names none", async () => {
    const { client, calls } = makeClient();
    await client.listEbuyRequests();
    expect(params(calls).has("shape")).toBe(false);
  });

  it("caps limit at 100 and passes an explicit shape through", async () => {
    const { client, calls } = makeClient();
    await client.listEbuyRequests({ limit: 500, shape: "rfq_id,title,attachments(doc_seq_num,is_link)" });
    const p = params(calls);
    expect(p.get("limit")).toBe("100");
    expect(p.get("shape")).toBe("rfq_id,title,attachments(doc_seq_num,is_link)");
  });

  it("parses list results", async () => {
    const { client } = makeClient({ body: { count: 1, next: null, previous: null, results: [REQUEST] } });
    const page = await client.listEbuyRequests({ status: "Open" });
    expect(page.count).toBe(1);
    expect(page.results[0].rfq_id).toBe("RFQ1835158");
    expect(page.results[0].attachment_count).toBe(2);
  });

  it("returns an empty page, not an error, for an account with no linked contract", async () => {
    const { client } = makeClient();
    const page = await client.listEbuyRequests();
    expect(page.count).toBe(0);
    expect(page.results).toEqual([]);
  });

  it("getEbuyRequest uses the rfq_id route and returns attachments", async () => {
    const { client, calls } = makeClient({ body: DETAIL });
    const request = await client.getEbuyRequest("RFQ1835158");
    expect(new URL(calls[0].url).pathname).toBe("/api/ebuy/requests/RFQ1835158/");
    expect(params(calls).has("shape")).toBe(false);
    expect(request.attachments?.map((a) => [a.doc_seq_num, a.is_link])).toEqual([
      [3852759, false],
      [3852760, true],
    ]);
    expect(request.organization?.office_code).toBe("36C10B");
  });

  it("getEbuyRequest threads shape and flat", async () => {
    const { client, calls } = makeClient({ body: DETAIL });
    await client.getEbuyRequest("RFQ1835158", { shape: "rfq_id,organization(*)", flat: true, joiner: "__", flatLists: true });
    const p = params(calls);
    expect(p.get("shape")).toBe("rfq_id,organization(*)");
    expect(p.get("flat")).toBe("true");
    expect(p.get("joiner")).toBe("__");
    expect(p.get("flat_lists")).toBe("true");
  });

  it("getEbuyRequest passes attachments(extracted_text) through and keeps the key absent where the API omits it", async () => {
    const shape = "rfq_id,attachments(doc_seq_num,is_link,extracted_text)";
    const body: EbuyRequestRecord = {
      rfq_id: "RFQ1835158",
      attachments: [
        { doc_seq_num: 3852759, is_link: false, extracted_text: "Statement of work." },
        { doc_seq_num: 3852760, is_link: true },
      ],
    };
    const { client, calls } = makeClient({ body });
    const request = await client.getEbuyRequest("RFQ1835158", { shape });
    expect(params(calls).get("shape")).toBe(shape);
    const [document, link] = request.attachments ?? [];
    expect(document.extracted_text).toBe("Statement of work.");
    expect("extracted_text" in link).toBe(false);
  });

  it("listEbuyRequests passes attachments(extracted_text) through", async () => {
    const { client, calls } = makeClient();
    await client.listEbuyRequests({ shape: "rfq_id,attachments(extracted_text)" });
    expect(params(calls).get("shape")).toBe("rfq_id,attachments(extracted_text)");
  });

  it("getEbuyRequest rejects an empty id before issuing a request", async () => {
    const { client, calls } = makeClient();
    await expect(client.getEbuyRequest("")).rejects.toThrow(TangoValidationError);
    expect(calls).toHaveLength(0);
  });

  it("getEbuyRequest raises TangoNotFoundError for an out-of-scope id", async () => {
    const { client } = makeClient({ status: 404, body: { detail: "Not found." } });
    await expect(client.getEbuyRequest("RFQ0000000")).rejects.toThrow(TangoNotFoundError);
  });
});

describe("TangoClient — eBuy attachment URL", () => {
  const PRESIGNED = "https://documents.example.com/ebuy/sow.pdf?X-Amz-Expires=300&X-Amz-Signature=abc";

  it("returns the redirect target without following it", async () => {
    const { client, calls } = makeClient({ status: 302, headers: { Location: PRESIGNED }, body: undefined });
    const url = await client.getEbuyAttachmentUrl("RFQ1835158", 3852759);
    expect(url).toBe(PRESIGNED);
    expect(calls).toHaveLength(1);
    expect(new URL(calls[0].url).pathname).toBe("/api/ebuy/requests/RFQ1835158/attachments/3852759/download/");
    expect(calls[0].init?.redirect).toBe("manual");
  });

  it("raises TangoEbuyAttachmentLinkError carrying the link url for a link entry", async () => {
    const { client } = makeClient({
      status: 400,
      body: { detail: "This entry is an external link, not a stored document.", url: "https://example.gov/portal" },
    });
    const err = await client.getEbuyAttachmentUrl("RFQ1835158", 3852760).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TangoEbuyAttachmentLinkError);
    expect(err).toBeInstanceOf(TangoValidationError);
    expect((err as TangoEbuyAttachmentLinkError).url).toBe("https://example.gov/portal");
    expect((err as TangoEbuyAttachmentLinkError).statusCode).toBe(400);
  });

  it("raises TangoNotFoundError when the document has not been captured yet", async () => {
    const { client } = makeClient({ status: 404, body: { detail: "The document for this attachment has not been captured yet." } });
    const err = await client.getEbuyAttachmentUrl("RFQ1835158", 3852759).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TangoNotFoundError);
    expect((err as TangoNotFoundError).responseData).toEqual({ detail: "The document for this attachment has not been captured yet." });
  });

  it("keeps a plain 400 without a url as TangoValidationError", async () => {
    const { client } = makeClient({ status: 400, body: { detail: "bad" } });
    const err = await client.getEbuyAttachmentUrl("RFQ1835158", 1).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TangoValidationError);
    expect(err).not.toBeInstanceOf(TangoEbuyAttachmentLinkError);
  });

  it("rejects missing arguments before issuing a request", async () => {
    const { client, calls } = makeClient();
    await expect(client.getEbuyAttachmentUrl("", 1)).rejects.toThrow(TangoValidationError);
    await expect(client.getEbuyAttachmentUrl("RFQ1835158", "")).rejects.toThrow(TangoValidationError);
    expect(calls).toHaveLength(0);
  });
});

describe("TangoClient — eBuy access", () => {
  it.each<EbuyAccess>([
    { enabled: true, reason: null, contracts: ["CONTRACT-1", "CONTRACT-2"] },
    { enabled: false, reason: "no_contract_grant", contracts: [] },
    { enabled: false, reason: "tier_required", contracts: [] },
  ])("returns the access payload as served ($reason)", async (payload) => {
    const { client, calls } = makeClient({ body: payload });
    const access = await client.getEbuyAccess();
    expect(new URL(calls[0].url).pathname).toBe("/api/ebuy/access/");
    expect(access).toEqual(payload);
  });
});

describe("EbuyRequest shape schema", () => {
  const registry = new SchemaRegistry();

  it.each(Object.keys(DETAIL))("%s is a known field", (field) => {
    expect(registry.getSchema("EbuyRequest").fields[field]).toBeDefined();
  });

  it("attachments nest the EbuyAttachment schema as a list", () => {
    const spec = registry.getField("EbuyRequest", "attachments");
    expect(spec.isList).toBe(true);
    expect(spec.nestedModel).toBe("EbuyAttachment");
    expect(registry.getField("EbuyAttachment", "doc_seq_num").type).toBe("int");
  });

  it("extracted_text is an optional string leaf on EbuyAttachment", () => {
    const spec = registry.getField("EbuyAttachment", "extracted_text");
    expect(spec.type).toBe("str");
    expect(spec.isOptional).toBe(true);
  });

  it("organization nests the shared office schema", () => {
    expect(registry.getField("EbuyRequest", "organization").nestedModel).toBe("OrganizationOffice");
  });

  it.each(["contract_number", "search", "agency"])("%s is a filter and never a response field", (field) => {
    expect(registry.getSchema("EbuyRequest").fields[field]).toBeUndefined();
  });
});
