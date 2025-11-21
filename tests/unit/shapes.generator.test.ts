import { ShapeParser } from "../../src/shapes/parser.js";
import { TypeGenerator } from "../../src/shapes/generator.js";

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
});
