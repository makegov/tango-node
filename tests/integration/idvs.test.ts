import { describeIntegration, integrationClient } from "./harness.js";
import { expectFields, expectNonEmpty } from "./validation.js";

describeIntegration("idvs (recorded)", () => {
  it("lists IDVs with the default minimal shape", async () => {
    const client = integrationClient("idvs-list");
    const res = await client.listIdvs({ limit: 3 });
    const first = expectNonEmpty(res);
    expectFields(first, ["key", "piid", "idv_type"]);
  });

  it("filters IDVs by fiscal year with a custom shape", async () => {
    const client = integrationClient("idvs-filter");
    const res = await client.listIdvs({ limit: 3, fiscal_year: 2024, shape: "key,piid,fiscal_year" });
    const first = expectNonEmpty(res);
    expect(Number(first.fiscal_year)).toBe(2024);
  });
});
