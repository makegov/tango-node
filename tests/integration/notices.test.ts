import { describeIntegration, integrationClient } from "./harness.js";
import { expectFields, expectNonEmpty } from "./validation.js";

describeIntegration("notices (recorded)", () => {
  it("lists notices with the default minimal shape", async () => {
    const client = integrationClient("notices-list");
    const res = await client.listNotices({ limit: 3 });
    const first = expectNonEmpty(res);
    expectFields(first, ["notice_id", "title", "posted_date"]);
  });

  it("filters notices by posted date", async () => {
    const client = integrationClient("notices-filter");
    const res = await client.listNotices({ limit: 3, posted_date_after: "2025-01-01" });
    const first = expectNonEmpty(res);
    expect(String(first.posted_date) >= "2025-01-01").toBe(true);
  });
});
