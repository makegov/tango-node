import { SchemaRegistry } from "../../src/shapes/schema.js";
import { ShapeParser } from "../../src/shapes/parser.js";
import { TypeGenerator } from "../../src/shapes/generator.js";
import { GENERATED_NESTED, GENERATED_OVERLAY } from "../../src/shapes/generatedOverlay.js";
import { EXPLICIT_SCHEMAS } from "../../src/shapes/explicitSchemas.js";

describe("Generated overlay — registry merge", () => {
  const registry = new SchemaRegistry();

  it("registers full model schemas for resources with no curated base", () => {
    for (const model of ["Naics", "PSC", "MasSin", "BudgetAccount", "AssistanceListing", "BusinessType"]) {
      const schema = registry.getSchema(model);
      expect(Object.keys(schema.fields).length).toBeGreaterThan(0);
    }
    expect(registry.getField("Naics", "code")).toBeDefined();
    expect(registry.getField("BudgetAccount", "fiscal_year")).toBeDefined();
  });

  it("overlay additions win over a curated flat scalar so expand sub-fields resolve", () => {
    expect(EXPLICIT_SCHEMAS.Contract.set_aside.nestedModel ?? null).toBeNull();
    const merged = registry.getField("Contract", "set_aside");
    expect(merged.nestedModel).toBe("CodeDescription");
    expect(registry.getField("CodeDescription", "code")).toBeDefined();
  });

  it("curated fields survive the merge untouched", () => {
    expect(registry.getField("Contract", "key")).toEqual(EXPLICIT_SCHEMAS.Contract.key);
    expect(registry.getField("Entity", "uei")).toEqual(EXPLICIT_SCHEMAS.Entity.uei);
  });

  it("generated nested schema names never shadow curated model names", () => {
    for (const name of Object.keys(GENERATED_NESTED)) {
      expect(EXPLICIT_SCHEMAS[name]).toBeUndefined();
    }
  });

  it("every nested pointer in the overlay resolves through the registry", () => {
    const maps = [...Object.values(GENERATED_NESTED), ...Object.values(GENERATED_OVERLAY)];
    for (const fields of maps) {
      for (const field of Object.values(fields)) {
        if (field.nestedModel) {
          expect(Object.keys(registry.getSchema(field.nestedModel).fields).length).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe("Entity relationships shape coverage", () => {
  const registry = new SchemaRegistry();

  it("Entity.relationships is a list expand with a nested schema", () => {
    const field = registry.getField("Entity", "relationships");
    expect(field.isList).toBe(true);
    expect(field.nestedModel).toBe("Relationships");
    const nested = registry.getSchema("Relationships").fields;
    for (const name of ["type", "source", "uei", "display_name", "relation", "confidence", "verification_method"]) {
      expect(nested[name]).toBeDefined();
    }
  });

  it("relationships(type, source) generates a model descriptor without raising", () => {
    const parser = new ShapeParser();
    const generator = new TypeGenerator({ schemaRegistry: registry });
    const spec = parser.parse("uei,relationships(type,source)");
    const model = generator.generateModelDescriptor("Entity", spec);
    const rel = model.fields.find((f) => f.field.name === "relationships");
    expect(rel?.nestedModel?.fields.map((f) => f.field.name).sort()).toEqual(["source", "type"]);
  });
});
