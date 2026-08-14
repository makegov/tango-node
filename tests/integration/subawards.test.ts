import { describeIntegration, integrationClient } from "./harness.js";
import { expectNonEmpty } from "./validation.js";

describeIntegration("subawards (recorded)", () => {
  it("lists subawards", async () => {
    const client = integrationClient("subawards-list");
    const res = await client.listSubawards({ limit: 3 });
    const first = expectNonEmpty(res);
    expect(Object.keys(first).length).toBeGreaterThan(0);
  });

  it("lists subawards with explicit ordering", async () => {
    const client = integrationClient("subawards-ordering");
    const res = await client.listSubawards({ limit: 3, ordering: "-last_modified_date" });
    const first = expectNonEmpty(res);
    expect(Object.keys(first).length).toBeGreaterThan(0);
  });
});
