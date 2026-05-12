import { ShapeParser } from "../../src/shapes/parser.js";
import { EXPAND_ALIASES, TypeGenerator } from "../../src/shapes/generator.js";

describe("TypeGenerator", () => {
  const parser = new ShapeParser();
  const generator = new TypeGenerator();

  it("generates descriptors for Contract minimal shape", () => {
    const spec = parser.parse("key,piid,award_date,recipient(display_name,uei)");
    const model = generator.generateModelDescriptor("Contract", spec);

    const names = model.fields.map((f) => f.field.name);
    expect(names).toContain("key");
    expect(names).toContain("piid");
    expect(names).toContain("award_date");
    expect(names).toContain("recipient");

    const awardDate = model.fields.find((f) => f.field.name === "award_date");
    expect(awardDate?.field.type).toBe("date");

    const recipient = model.fields.find((f) => f.field.name === "recipient");
    expect(recipient?.nestedModel).toBeDefined();
    expect(recipient?.nestedModel?.modelName).toBe("RecipientProfile");
  });

  it("caches generated models", () => {
    const spec = parser.parse("key,piid");
    const first = generator.generateModelDescriptor("Contract", spec);
    const second = generator.generateModelDescriptor("Contract", spec);
    expect(second).toBe(first);
  });

  describe("naics(...) / psc(...) expand aliases", () => {
    // Mirrors the server's `_EXPAND_ALIASES` map. See makegov/tango#2257 and
    // makegov/tango#2265.

    it("exposes the alias map", () => {
      expect(EXPAND_ALIASES).toEqual({ naics_code: "naics", psc_code: "psc" });
    });

    it("accepts canonical naics(code,description) on Contract", () => {
      const localGen = new TypeGenerator();
      const spec = parser.parse("key,naics(code,description)");
      const model = localGen.generateModelDescriptor("Contract", spec);
      const naics = model.fields.find((f) => f.field.name === "naics");
      expect(naics).toBeDefined();
      expect(naics?.nestedModel?.modelName).toBe("CodeDescription");
      const nestedNames = naics?.nestedModel?.fields.map((f) => f.field.name) ?? [];
      expect(nestedNames).toEqual(["code", "description"]);
    });

    it("accepts legacy naics_code(code,description) as a Contract expand alias", () => {
      const localGen = new TypeGenerator();
      const spec = parser.parse("key,naics_code(code,description)");
      const model = localGen.generateModelDescriptor("Contract", spec);
      // Alias is rewritten to the canonical "naics" — matches server behavior
      // (the canonical name becomes the output key regardless of which
      // spelling the caller used).
      const naics = model.fields.find((f) => f.field.name === "naics");
      expect(naics).toBeDefined();
      expect(naics?.alias).toBe("naics");
      expect(naics?.nestedModel?.modelName).toBe("CodeDescription");
    });

    it("accepts canonical psc(code,description) on Contract", () => {
      const localGen = new TypeGenerator();
      const spec = parser.parse("key,psc(code,description)");
      const model = localGen.generateModelDescriptor("Contract", spec);
      const psc = model.fields.find((f) => f.field.name === "psc");
      expect(psc).toBeDefined();
      expect(psc?.nestedModel?.modelName).toBe("CodeDescription");
    });

    it("accepts legacy psc_code(code,description) as a Contract expand alias", () => {
      const localGen = new TypeGenerator();
      const spec = parser.parse("key,psc_code(code,description)");
      const model = localGen.generateModelDescriptor("Contract", spec);
      const psc = model.fields.find((f) => f.field.name === "psc");
      expect(psc).toBeDefined();
      expect(psc?.alias).toBe("psc");
      expect(psc?.nestedModel?.modelName).toBe("CodeDescription");
    });

    it("leaves scalar naics_code (no parens) untouched on Contract", () => {
      // Bare leaves keep returning the raw integer column value — only
      // expands (parens present) are rewritten.
      const localGen = new TypeGenerator();
      const spec = parser.parse("key,naics_code");
      const model = localGen.generateModelDescriptor("Contract", spec);
      const naicsCode = model.fields.find((f) => f.field.name === "naics_code");
      expect(naicsCode).toBeDefined();
      expect(naicsCode?.nestedModel).toBeFalsy();
      expect(naicsCode?.field.type).toBe("int");
      // The canonical "naics" field must not sneak into the descriptor when
      // only the scalar form was requested.
      expect(model.fields.find((f) => f.field.name === "naics")).toBeUndefined();
    });

    it("leaves scalar psc_code (no parens) untouched on Contract", () => {
      const localGen = new TypeGenerator();
      const spec = parser.parse("key,psc_code");
      const model = localGen.generateModelDescriptor("Contract", spec);
      const pscCode = model.fields.find((f) => f.field.name === "psc_code");
      expect(pscCode).toBeDefined();
      expect(pscCode?.nestedModel).toBeFalsy();
      expect(pscCode?.field.type).toBe("str");
      expect(model.fields.find((f) => f.field.name === "psc")).toBeUndefined();
    });

    it("accepts the alias on Opportunity, Notice, Forecast, and Vehicle", () => {
      const cases: Array<[string, string]> = [
        ["Opportunity", "naics_code(code,description)"],
        ["Notice", "naics_code(code,description)"],
        ["Forecast", "naics_code(code,description)"],
        ["Vehicle", "naics_code(code,description)"],
        ["Opportunity", "psc_code(code,description)"],
        ["Notice", "psc_code(code,description)"],
        ["Vehicle", "psc_code(code,description)"],
      ];
      for (const [model, shape] of cases) {
        const localGen = new TypeGenerator();
        const spec = parser.parse(shape);
        expect(() => localGen.generateModelDescriptor(model, spec)).not.toThrow();
      }
    });

    it("preserves user-supplied aliases on the rewritten field", () => {
      // ``naics_code::primary_naics(code,description)`` should rewrite the
      // expand name to canonical but still emit under the user's alias.
      const localGen = new TypeGenerator();
      const spec = parser.parse("key,naics_code::primary_naics(code,description)");
      const model = localGen.generateModelDescriptor("Contract", spec);
      const aliased = model.fields.find((f) => f.alias === "primary_naics");
      expect(aliased).toBeDefined();
      expect(aliased?.field.name).toBe("naics");
      expect(aliased?.nestedModel?.modelName).toBe("CodeDescription");
    });
  });
});
