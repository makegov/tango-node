import { describeIntegration, integrationClient } from "./harness.js";
import { expectFields, expectNonEmpty } from "./validation.js";

describeIntegration("budget accounts (recorded)", () => {
  it("lists budget accounts", async () => {
    const client = integrationClient("budget-list");
    const res = await client.listBudgetAccounts({ limit: 3 });
    const first = expectNonEmpty(res);
    expectFields(first, ["federal_account_symbol", "fiscal_year"]);
  });

  it("round-trips a fiscal-year range filter", async () => {
    const client = integrationClient("budget-range");
    const res = await client.listBudgetAccounts({ limit: 5, fiscal_year__gte: 2024, fiscal_year__lte: 2025 });
    expectNonEmpty(res);
    for (const row of res.results) {
      const fy = Number(row.fiscal_year);
      expect(fy).toBeGreaterThanOrEqual(2024);
      expect(fy).toBeLessThanOrEqual(2025);
    }
  });
});
