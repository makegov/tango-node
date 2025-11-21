import { TangoClient } from "../../src/client";
import { ShapeConfig } from "../../src/config.js";
import { TangoValidationError } from "../../src/errors.js";

describe("TangoClient", () => {
  it("maps high-level contract filters to API query params", async () => {
    const calls: { url: string; init: RequestInit }[] = [];

    const fetchImpl = async (url: string | URL, init?: RequestInit): Promise<any> => {
      calls.push({ url: String(url), init: init ?? {} });

      const payload = {
        count: 1,
        next: null,
        previous: null,
        results: [
          {
            key: "C-1",
            piid: "PIID-1",
            award_date: "2024-01-15",
            "recipient.display_name": "Acme Corp",
          },
        ],
      };

      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify(payload);
        },
      };
    };

    const client = new TangoClient({
      apiKey: "test",
      baseUrl: "https://example.test",
      fetchImpl,
    });

    const resp = await client.listContracts({
      keyword: "cloud",
      naics_code: "541511",
      psc_code: "D302",
      recipient_name: "Acme",
      recipient_uei: "UEI123",
      set_aside_type: "SB",
      sort: "award_date",
      order: "desc",
      flat: true,
      limit: 5,
      page: 2,
    });

    expect(resp.results).toHaveLength(1);
    const contract = resp.results[0] as any;
    // flat=true + unflattenResponse should give nested recipient
    expect(contract.recipient.display_name).toBe("Acme Corp");

    expect(calls).toHaveLength(1);
    const { url } = calls[0];
    const parsed = new URL(url);

    expect(parsed.searchParams.get("search")).toBe("cloud");
    expect(parsed.searchParams.get("naics")).toBe("541511");
    expect(parsed.searchParams.get("psc")).toBe("D302");
    expect(parsed.searchParams.get("recipient")).toBe("Acme");
    expect(parsed.searchParams.get("uei")).toBe("UEI123");
    expect(parsed.searchParams.get("set_aside")).toBe("SB");
    expect(parsed.searchParams.get("ordering")).toBe("-award_date");
    expect(parsed.searchParams.get("shape")).toBe(ShapeConfig.CONTRACTS_MINIMAL);
    expect(parsed.searchParams.get("flat")).toBe("true");
    expect(parsed.searchParams.get("limit")).toBe("5");
    expect(parsed.searchParams.get("page")).toBe("2");
  });

  it("uses default shapes for entities and supports search", async () => {
    const calls: { url: string; init: RequestInit }[] = [];

    const fetchImpl = async (url: string | URL, init?: RequestInit): Promise<any> => {
      calls.push({ url: String(url), init: init ?? {} });

      const payload = {
        count: 1,
        next: null,
        previous: null,
        results: [
          {
            uei: "UEI123",
            legal_business_name: "Acme Corp",
          },
        ],
      };

      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify(payload);
        },
      };
    };

    const client = new TangoClient({
      apiKey: "test",
      baseUrl: "https://example.test",
      fetchImpl,
    });

    const resp = await client.listEntities({
      search: "Acme",
      limit: 1,
    });

    expect(resp.results[0]).toMatchObject({
      uei: "UEI123",
      legal_business_name: "Acme Corp",
    });

    const parsed = new URL(calls[0].url);
    expect(parsed.searchParams.get("search")).toBe("Acme");
    expect(parsed.searchParams.get("shape")).toBe(ShapeConfig.ENTITIES_MINIMAL);
  });

  it("validates required arguments", async () => {
    const client = new TangoClient({
      apiKey: "test",
      baseUrl: "https://example.test",
      fetchImpl: async () => {
        throw new Error("should not be called");
      },
    });

    // @ts-expect-error
    await expect(client.getAgency("")).rejects.toBeInstanceOf(TangoValidationError);
    // @ts-expect-error
    await expect(client.getEntity("")).rejects.toBeInstanceOf(TangoValidationError);
  });
});
