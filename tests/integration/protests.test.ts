import { describeIntegration, integrationClient } from "./harness.js";
import { expectFields, expectNonEmpty } from "./validation.js";

describeIntegration("protests (recorded)", () => {
  it("lists protests", async () => {
    const client = integrationClient("protests-list");
    const res = await client.listProtests({ limit: 3 });
    const first = expectNonEmpty(res);
    expectFields(first, ["case_number"]);
  });

  it("filters protests by filed date", async () => {
    const client = integrationClient("protests-filter");
    const res = await client.listProtests({ limit: 3, filed_date_after: "2025-01-01" });
    const first = expectNonEmpty(res);
    expect(String(first.filed_date) >= "2025-01-01").toBe(true);
  });
});
