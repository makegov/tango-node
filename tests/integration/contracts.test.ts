import { describeIntegration, integrationClient } from "./harness.js";
import { expectFields, expectNonEmpty, expectPagination } from "./validation.js";

describeIntegration("contracts (recorded)", () => {
  it("lists contracts with the default minimal shape", async () => {
    const client = integrationClient("contracts-list");
    const res = await client.listContracts({ limit: 3 });
    const first = expectNonEmpty(res);
    expectFields(first, ["key", "piid", "award_date", "total_contract_value"]);
  });

  it("lists contracts with a custom shape", async () => {
    const client = integrationClient("contracts-shape");
    const res = await client.listContracts({ limit: 3, shape: "key,piid,total_contract_value" });
    const first = expectNonEmpty(res);
    expectFields(first, ["key", "piid", "total_contract_value"]);
    expect(first).not.toHaveProperty("description");
  });

  it("paginates with a cursor", async () => {
    const client = integrationClient("contracts-cursor");
    const page1 = await client.listContracts({ limit: 2 });
    expectNonEmpty(page1);
    expect(page1.cursor).toBeTruthy();

    const page2 = await client.listContracts({ limit: 2, cursor: page1.cursor });
    const first2 = expectNonEmpty(page2);
    expect(first2.key).not.toBe(page1.results[0].key);
  });

  it("filters by fiscal year and award date", async () => {
    const client = integrationClient("contracts-filter");
    const res = await client.listContracts({
      limit: 3,
      fiscal_year: 2024,
      award_date_gte: "2024-01-01",
      shape: "key,piid,award_date,fiscal_year",
    });
    const first = expectNonEmpty(res);
    expect(Number(first.fiscal_year)).toBe(2024);
    expect(String(first.award_date) >= "2024-01-01").toBe(true);
  });

  it("returns an empty page for a hopeless search", async () => {
    const client = integrationClient("contracts-empty");
    const res = await client.listContracts({ limit: 3, search: "zzzz-no-such-contract-zzzz" });
    expectPagination(res);
    expect(res.count).toBe(0);
    expect(res.results).toHaveLength(0);
  });
});
