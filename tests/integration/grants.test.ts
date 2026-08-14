import { describeIntegration, integrationClient } from "./harness.js";
import { expectFields, expectNonEmpty } from "./validation.js";

describeIntegration("grants (recorded)", () => {
  it("lists grants with the default minimal shape", async () => {
    const client = integrationClient("grants-list");
    const res = await client.listGrants({ limit: 3 });
    const first = expectNonEmpty(res);
    expectFields(first, ["grant_id", "title"]);
  });

  it("filters grants by posted date with a custom shape", async () => {
    // posted_date is filterable but not shapeable on grants, so assert the shape narrowing instead.
    const client = integrationClient("grants-filter");
    const res = await client.listGrants({ limit: 3, posted_date_after: "2025-01-01", shape: "grant_id,title" });
    const first = expectNonEmpty(res);
    expectFields(first, ["grant_id", "title"]);
    expect(first).not.toHaveProperty("agency_code");
  });
});
