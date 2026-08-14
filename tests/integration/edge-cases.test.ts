import { TangoNotFoundError, TangoValidationError } from "../../src/errors.js";
import { describeIntegration, integrationClient } from "./harness.js";
import { expectPagination } from "./validation.js";

describeIntegration("edge cases (recorded)", () => {
  it("raises TangoNotFoundError for a nonexistent contract key", async () => {
    const client = integrationClient("edge-contract-404");
    await expect(client.getContract("tango-node-no-such-key")).rejects.toThrow(TangoNotFoundError);
  });

  it("raises TangoValidationError for a disallowed vehicles ordering", async () => {
    const client = integrationClient("edge-vehicles-bad-ordering");
    await expect(client.listVehicles({ limit: 3, ordering: "not_a_real_field" })).rejects.toThrow(TangoValidationError);
  });

  it("returns an empty, well-formed page when a filter matches nothing", async () => {
    const client = integrationClient("edge-entities-empty");
    const res = await client.listEntities({ limit: 3, search: "zzzz-no-such-entity-zzzz" });
    expectPagination(res);
    expect(res.count).toBe(0);
    expect(res.results).toHaveLength(0);
  });
});
