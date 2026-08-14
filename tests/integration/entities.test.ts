import { describeIntegration, integrationClient } from "./harness.js";
import { expectFields, expectNonEmpty } from "./validation.js";

describeIntegration("entities (recorded)", () => {
  it("lists entities with the default minimal shape", async () => {
    const client = integrationClient("entities-list");
    const res = await client.listEntities({ limit: 3 });
    const first = expectNonEmpty(res);
    expectFields(first, ["uei", "legal_business_name"]);
  });

  it("filters entities by state with a custom shape", async () => {
    const client = integrationClient("entities-filter");
    const res = await client.listEntities({ limit: 3, state: "VA", shape: "uei,legal_business_name" });
    const first = expectNonEmpty(res);
    expectFields(first, ["uei", "legal_business_name"]);
    expect(first).not.toHaveProperty("cage_code");
  });
});
