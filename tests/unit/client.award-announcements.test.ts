/**
 * Tests for the award announcements endpoint (`/api/news/award_announcements/`).
 *
 * Covers the request contract (path, filters under the API's own param names, default shapes, the uuid detail route) via the injected fetchImpl mock, plus the shape schema the SDK registers for the resource.
 */

import { readFileSync } from "node:fs";
import { TangoClient } from "../../src/client.js";
import type { ListAwardAnnouncementsOptions } from "../../src/client.js";
import { ShapeConfig } from "../../src/config.js";
import type { AwardAnnouncement } from "../../src/models/index.js";
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

const UUID = "7d1e3a5c-2b4f-5a6e-8c0d-9f1b3d5e7a9c";

const ANNOUNCEMENT: AwardAnnouncement = {
  uuid: UUID,
  source: "official_release",
  source_name: "Department of War contracts",
  source_url: "https://example.gov/contracts/2026-10-22",
  published_date: "2026-10-22",
  award_date: "2026-10-21",
  title: "Example Systems Corp., Arlington, Virginia",
  text: "Example Systems Corp., Arlington, Virginia, is awarded a $125,000,000 contract.",
  amount: "125000000.00",
  value_kind: "face_value",
  obligated_at_award: "1500000.00",
  action_type: "new_award",
  awardee_count: 1,
  piids: ["N0001925C0070"],
  award_uuids: ["0b9d2c1e-5f4a-4c8b-9a37-2d6e8f1a4b90"],
  civilian: false,
  component: "NAVY",
  corrections: [{ publish_date: "2026-10-23", text: "Correction.", changes: [] }],
  is_withdrawn: false,
  awardees: [{ name: "Example Systems Corp.", uei: null, location: "Arlington, Virginia", small_business: true }],
  organization: { organization_id: "c4a8f6de-0000-4000-8000-000000000001", agency_name: "Department of the Navy" },
};

describe("TangoClient: award announcements", () => {
  it("listAwardAnnouncements sends every filter under the API's param name", async () => {
    const filters: ListAwardAnnouncementsOptions = {
      search: '"hypersonic"',
      source: "makegov_generated",
      agency: "Navy|Army",
      component: "NAVY",
      published_date_after: "2026-09-01",
      published_date_before: "2026-09-30",
      award_date_after: "2026-08-01",
      award_date_before: "2026-08-31",
      amount_min: 100000000,
      amount_max: "500000000",
      piid: "N00019-25-C-0070",
      awardee: "lockheed",
      uei: "ABC123DEF456",
      action_type: "new_award|order",
      announcement_type: "new_vehicle",
      civilian: true,
      small_business: true,
      is_modification: true,
      is_multiple_award: true,
      include_withdrawn: true,
      ordering: "-amount",
    };
    const { client, calls } = makeClient();
    await client.listAwardAnnouncements(filters);

    expect(new URL(calls[0].url).pathname).toBe("/api/news/award_announcements/");
    expect(Object.fromEntries(params(calls))).toMatchObject({
      search: '"hypersonic"',
      source: "makegov_generated",
      agency: "Navy|Army",
      component: "NAVY",
      published_date_after: "2026-09-01",
      published_date_before: "2026-09-30",
      award_date_after: "2026-08-01",
      award_date_before: "2026-08-31",
      amount_min: "100000000",
      amount_max: "500000000",
      piid: "N00019-25-C-0070",
      awardee: "lockheed",
      uei: "ABC123DEF456",
      action_type: "new_award|order",
      announcement_type: "new_vehicle",
      civilian: "true",
      small_business: "true",
      is_modification: "true",
      is_multiple_award: "true",
      include_withdrawn: "true",
      ordering: "-amount",
    });
  });

  it("sends a false boolean filter rather than dropping it", async () => {
    const { client, calls } = makeClient();
    await client.listAwardAnnouncements({ small_business: false, is_modification: false });
    expect(params(calls).get("small_business")).toBe("false");
    expect(params(calls).get("is_modification")).toBe("false");
  });

  it("defaults the list to AWARD_ANNOUNCEMENTS_MINIMAL", async () => {
    const { client, calls } = makeClient();
    await client.listAwardAnnouncements();
    expect(params(calls).get("shape")).toBe(ShapeConfig.AWARD_ANNOUNCEMENTS_MINIMAL);
  });

  it("parses dates and normalizes the amount on a list row", async () => {
    const { client } = makeClient({ count: 1, next: null, previous: null, results: [ANNOUNCEMENT] });
    const page = await client.listAwardAnnouncements();
    const row = page.results[0];
    expect(row.published_date).toBeInstanceOf(Date);
    expect(row.amount).toBe("125000000.00");
    expect(row.piids).toEqual(["N0001925C0070"]);
    expect(row).not.toHaveProperty("text");
  });

  it("getAwardAnnouncement uses the uuid route and the comprehensive default", async () => {
    const { client, calls } = makeClient(ANNOUNCEMENT);
    const row = await client.getAwardAnnouncement(UUID);
    expect(new URL(calls[0].url).pathname).toBe(`/api/news/award_announcements/${UUID}/`);
    expect(params(calls).get("shape")).toBe(ShapeConfig.AWARD_ANNOUNCEMENTS_COMPREHENSIVE);
    expect(row.text).toBe(ANNOUNCEMENT.text);
    expect(row.award_date).toBeInstanceOf(Date);
    expect(row.corrections).toEqual(ANNOUNCEMENT.corrections);
    expect(row.awardees).toEqual([{ name: "Example Systems Corp.", uei: null, location: "Arlington, Virginia", small_business: true }]);
    expect((row.organization as { agency_name: string }).agency_name).toBe("Department of the Navy");
  });

  it("getAwardAnnouncement honors a shape with explicit expands", async () => {
    const { client, calls } = makeClient({ uuid: UUID, awardees: [{ name: "Example Systems Corp." }] });
    const row = await client.getAwardAnnouncement(UUID, { shape: "uuid,awardees(name)" });
    expect(params(calls).get("shape")).toBe("uuid,awardees(name)");
    expect(row.awardees).toEqual([{ name: "Example Systems Corp." }]);
  });

  it("getAwardAnnouncement rejects an empty uuid before issuing a request", async () => {
    const { client, calls } = makeClient();
    await expect(client.getAwardAnnouncement("")).rejects.toThrow("uuid is required");
    expect(calls).toHaveLength(0);
  });
});

describe("AwardAnnouncement shape schema", () => {
  const registry = new SchemaRegistry();
  const contract = JSON.parse(readFileSync(new URL("../../contracts/filter_shape_contract.json", import.meta.url), "utf8"));
  const shape = contract.resources["news/award_announcements"].runtime.shape;
  const served: string[] = [...shape.fields, ...Object.keys(shape.expands)];

  it("the vendored contract lists the resource's shape fields and expands", () => {
    expect(served.length).toBeGreaterThanOrEqual(27);
    expect(served).toEqual(expect.arrayContaining(["value_kind", "awardees", "organization"]));
  });

  it("knows every field and expand the contract serves", () => {
    const known = registry.getSchema("AwardAnnouncement").fields;
    expect(served.filter((field) => known[field] === undefined)).toEqual([]);
  });

  it.each(["AWARD_ANNOUNCEMENTS_MINIMAL", "AWARD_ANNOUNCEMENTS_COMPREHENSIVE"] as const)("%s names only fields the contract serves", (preset) => {
    const names = ShapeConfig[preset].split(",").map((field) => field.replace("(*)", ""));
    expect(names.filter((field) => !served.includes(field))).toEqual([]);
  });

  it("the list default leaves out text and the detail default includes it", () => {
    expect(ShapeConfig.AWARD_ANNOUNCEMENTS_MINIMAL.split(",")).not.toContain("text");
    expect(ShapeConfig.AWARD_ANNOUNCEMENTS_COMPREHENSIVE.split(",")).toContain("text");
  });

  it.each(["piids", "award_uuids", "corrections", "awardees"])("%s is a list", (field) => {
    expect(registry.getField("AwardAnnouncement", field).isList).toBe(true);
  });

  it.each(["piid", "awardee", "uei", "amount_min", "include_withdrawn"])("%s is a filter and never a response field", (field) => {
    expect(registry.getSchema("AwardAnnouncement").fields[field]).toBeUndefined();
  });
});
