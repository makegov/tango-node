import { describeIntegration, integrationClient } from "./harness.js";
import { expectFields, expectNonEmpty } from "./validation.js";

describeIntegration("agencies and organizations (recorded)", () => {
  it("lists agencies", async () => {
    const client = integrationClient("agencies-list");
    const res = await client.listAgencies({ limit: 5 });
    const first = expectNonEmpty(res);
    expect(Object.keys(first).length).toBeGreaterThan(0);
  });

  it("gets a single agency by code", async () => {
    const client = integrationClient("agencies-get");
    const agency = await client.getAgency("4700");
    expect(Object.keys(agency).length).toBeGreaterThan(0);
  });

  it("lists organizations", async () => {
    const client = integrationClient("organizations-list");
    const res = await client.listOrganizations({ limit: 3 });
    const first = expectNonEmpty(res);
    expectFields(first, ["name", "level"]);
  });

  it("filters organizations to departments (level 1)", async () => {
    const client = integrationClient("organizations-filter");
    const res = await client.listOrganizations({ limit: 3, level: 1 });
    const first = expectNonEmpty(res);
    expect(Number(first.level)).toBe(1);
  });
});
