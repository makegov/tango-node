import { describeIntegration, integrationClient } from "./harness.js";
import { expectFields, expectNonEmpty } from "./validation.js";

describeIntegration("vehicles (recorded)", () => {
  it("lists vehicles with the default minimal shape", async () => {
    const client = integrationClient("vehicles-list");
    const res = await client.listVehicles({ limit: 3 });
    const first = expectNonEmpty(res);
    expectFields(first, ["uuid", "vehicle_type", "total_obligated"]);
  });

  it("searches vehicles by program", async () => {
    const client = integrationClient("vehicles-search");
    const res = await client.listVehicles({ limit: 3, search: "SEWP" });
    const first = expectNonEmpty(res);
    expectFields(first, ["uuid", "solicitation_identifier"]);
  });
});
