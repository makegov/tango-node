import { describeIntegration, integrationClient } from "./harness.js";
import { expectFields, expectNonEmpty } from "./validation.js";

describeIntegration("opportunities (recorded)", () => {
  it("lists opportunities with the default minimal shape", async () => {
    const client = integrationClient("opportunities-list");
    const res = await client.listOpportunities({ limit: 3 });
    const first = expectNonEmpty(res);
    expectFields(first, ["opportunity_id", "title"]);
  });

  it("filters to active opportunities with a custom shape", async () => {
    const client = integrationClient("opportunities-filter");
    const res = await client.listOpportunities({ limit: 3, active: true, shape: "opportunity_id,title,active" });
    const first = expectNonEmpty(res);
    expect(first.active).toBe(true);
  });
});
