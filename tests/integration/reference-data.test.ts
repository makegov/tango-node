import { describeIntegration, integrationClient } from "./harness.js";
import { expectNonEmpty, expectPagination } from "./validation.js";

describeIntegration("reference data (recorded)", () => {
  it("lists NAICS codes", async () => {
    const client = integrationClient("naics-list");
    const res = await client.listNaics({ limit: 3 });
    const first = expectNonEmpty(res);
    expect(Object.keys(first).length).toBeGreaterThan(0);
  });

  it("gets a single NAICS code", async () => {
    const client = integrationClient("naics-get");
    const naics = await client.getNaics("541511");
    expect(JSON.stringify(naics)).toContain("541511");
  });

  it("lists PSC codes", async () => {
    const client = integrationClient("psc-list");
    const res = await client.listPsc({ limit: 3 });
    const first = expectNonEmpty(res);
    expect(Object.keys(first).length).toBeGreaterThan(0);
  });

  it("filters PSC codes to ones with award history", async () => {
    const client = integrationClient("psc-filter");
    const res = await client.listPsc({ limit: 3, has_awards: true });
    expectPagination(res);
    expect(res.count).toBeGreaterThan(0);
  });
});
