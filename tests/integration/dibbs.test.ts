import { describeIntegration, integrationClient } from "./harness.js";
import { expectFields, expectNonEmpty, expectPagination } from "./validation.js";

describeIntegration("dibbs (recorded)", () => {
  it("lists RFQs with the default minimal shape", async () => {
    const client = integrationClient("dibbs-rfqs-list");
    const res = await client.listDibbsRfqs({ limit: 3 });
    const first = expectNonEmpty(res);
    expectFields(first, ["solicitation", "nsn"]);
  });

  it("filters RFQs to open ones", async () => {
    const client = integrationClient("dibbs-rfqs-open");
    const res = await client.listDibbsRfqs({ limit: 3, open: true });
    expectPagination(res);
    for (const row of res.results) {
      expect(row.is_open).toBe(true);
    }
  });

  it("lists DIBBS awards", async () => {
    const client = integrationClient("dibbs-awards-list");
    const res = await client.listDibbsAwards({ limit: 3 });
    const first = expectNonEmpty(res);
    expectFields(first, ["award_number", "award_date"]);
  });
});
