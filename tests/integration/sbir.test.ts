import { describeIntegration, integrationClient } from "./harness.js";
import { expectFields, expectNonEmpty, expectPagination } from "./validation.js";

describeIntegration("sbir (recorded)", () => {
  it("lists SBIR topics with the default minimal shape", async () => {
    const client = integrationClient("sbir-topics-list");
    const res = await client.listSbirTopics({ limit: 3 });
    const first = expectNonEmpty(res);
    expectFields(first, ["topic_number", "title"]);
  });

  it("filters SBIR topics by year", async () => {
    const client = integrationClient("sbir-topics-filter");
    const res = await client.listSbirTopics({ limit: 3, year: 2025 });
    expectPagination(res);
    for (const row of res.results) {
      expect(Number(row.year)).toBe(2025);
    }
  });

  it("lists SBIR solicitations", async () => {
    const client = integrationClient("sbir-solicitations-list");
    const res = await client.listSbirSolicitations({ limit: 3 });
    const first = expectNonEmpty(res);
    expectFields(first, ["solicitation_number", "program"]);
  });
});
