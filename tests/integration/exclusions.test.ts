import { describeIntegration, integrationClient } from "./harness.js";
import { expectFields, expectNonEmpty, expectPagination } from "./validation.js";

describeIntegration("exclusions (recorded)", () => {
  it("lists exclusions with the default minimal shape", async () => {
    const client = integrationClient("exclusions-list");
    const res = await client.listExclusions({ limit: 3 });
    const first = expectNonEmpty(res);
    expectFields(first, ["classification_type", "exclusion_type"]);
  });

  it("filters exclusions to currently-active ones", async () => {
    const client = integrationClient("exclusions-active");
    const res = await client.listExclusions({ limit: 3, active: true });
    expectPagination(res);
    for (const row of res.results) {
      expect(row.is_currently_excluded).toBe(true);
    }
  });
});
