import { describeIntegration, integrationClient } from "./harness.js";
import { expectFields, expectNonEmpty, expectPagination } from "./validation.js";

describeIntegration("forecasts (recorded)", () => {
  it("lists forecasts with the default minimal shape", async () => {
    const client = integrationClient("forecasts-list");
    const res = await client.listForecasts({ limit: 3 });
    const first = expectNonEmpty(res);
    expectFields(first, ["id", "title"]);
  });

  it("filters forecasts by NAICS prefix", async () => {
    const client = integrationClient("forecasts-filter");
    const res = await client.listForecasts({ limit: 3, naics_starts_with: "54", shape: "id,title,naics_code" });
    expectPagination(res);
    for (const row of res.results) {
      expect(String(row.naics_code)).toMatch(/^54/);
    }
  });
});
