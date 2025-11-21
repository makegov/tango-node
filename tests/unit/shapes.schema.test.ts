import { ShapeValidationError } from "../../src/errors.js";
import { SchemaRegistry } from "../../src/shapes/schema.js";

describe("SchemaRegistry", () => {
  const registry = new SchemaRegistry();

  it("returns schema for known models", () => {
    const contractSchema = registry.getSchema("Contract");
    expect(contractSchema.modelName).toBe("Contract");
    expect(Object.keys(contractSchema.fields)).toContain("award_date");
  });

  it("returns field schema for known fields", () => {
    const awardDate = registry.getField("Contract", "award_date");
    expect(awardDate.name).toBe("award_date");
    expect(awardDate.type).toBe("date");
  });

  it("throws for unknown model", () => {
    expect(() => registry.getSchema("NotAModel")).toThrow(ShapeValidationError);
  });

  it("throws for unknown field", () => {
    expect(() => registry.getField("Contract", "not_a_field")).toThrow(ShapeValidationError);
  });
});
