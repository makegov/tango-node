/**
 * The `obligations_by_fiscal_year(...)` expand on contracts, IDVs, OTAs and OT IDVs (Tango API 5.11.0).
 */

import { TangoClient } from "../../src/client.js";
import { ShapeValidationError } from "../../src/errors.js";
import { SchemaRegistry } from "../../src/shapes/schema.js";

const SHAPE = "key,obligations_by_fiscal_year(fiscal_year,obligated)";

function makeClient(body: unknown): { client: TangoClient; urls: string[] } {
  const urls: string[] = [];
  const fetchImpl = (async (url: string | URL) => {
    urls.push(String(url));
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify(body);
      },
    };
  }) as unknown as typeof fetch;
  const client = new TangoClient({ apiKey: "k", baseUrl: "http://localhost:8000", fetchImpl, retries: 0 });
  return { client, urls };
}

function page(rows: Record<string, unknown>[]): Record<string, unknown> {
  return { count: rows.length, next: null, previous: null, results: rows };
}

describe("obligations_by_fiscal_year schema", () => {
  it.each(["Contract", "IDV", "OTA", "OTIDV"])("%s declares it as a list of FiscalYearObligation", (model) => {
    const field = new SchemaRegistry().getField(model, "obligations_by_fiscal_year");
    expect(field).toMatchObject({ isList: true, isOptional: true, nestedModel: "FiscalYearObligation" });
  });

  it("FiscalYearObligation carries fiscal_year as int and obligated as Decimal", () => {
    const schema = new SchemaRegistry().getSchema("FiscalYearObligation");
    expect(schema.fields.fiscal_year.type).toBe("int");
    expect(schema.fields.obligated.type).toBe("Decimal");
  });
});

describe("obligations_by_fiscal_year responses", () => {
  it("listContracts sends the shape and parses each year", async () => {
    const { client, urls } = makeClient(
      page([
        {
          key: "K1",
          obligations_by_fiscal_year: [
            { fiscal_year: 2023, obligated: 1000.0 },
            { fiscal_year: 2024, obligated: -250.5 },
          ],
        },
      ]),
    );
    const res = await client.listContracts({ shape: SHAPE });

    expect(new URL(urls[0]).searchParams.get("shape")).toBe(SHAPE);
    expect(res.results[0].obligations_by_fiscal_year).toEqual([
      { fiscal_year: 2023, obligated: "1000" },
      { fiscal_year: 2024, obligated: "-250.5" },
    ]);
  });

  it.each(["key,obligations_by_fiscal_year(*)", "key,obligations_by_fiscal_year"])("listContracts accepts %s", async (shape) => {
    const { client } = makeClient(page([{ key: "K1", obligations_by_fiscal_year: null }]));
    const res = await client.listContracts({ shape });

    expect(res.results[0].key).toBe("K1");
  });

  it("listIdvs accepts the expand; the API's null reads as an empty list, like every nested list", async () => {
    const { client } = makeClient(page([{ key: "IDV1", obligations_by_fiscal_year: null }]));
    const res = await client.listIdvs({ shape: SHAPE });

    expect(res.results[0].obligations_by_fiscal_year).toEqual([]);
  });

  it("listContracts rejects an unknown sub-field", async () => {
    const { client } = makeClient(page([{ key: "K1", obligations_by_fiscal_year: [{ fiscal_year: 2024, obligated: 1 }] }]));

    await expect(client.listContracts({ shape: "key,obligations_by_fiscal_year(amount)" })).rejects.toThrow(ShapeValidationError);
  });
});
