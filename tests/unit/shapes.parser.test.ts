import { ShapeParseError } from "../../src/errors.js";
import { ShapeParser } from "../../src/shapes/parser.js";

describe("ShapeParser", () => {
  const parser = new ShapeParser();

  it("parses a simple shape", () => {
    const spec = parser.parse("key,piid,award_date");
    expect(spec.fields.map((f) => f.name)).toEqual(["key", "piid", "award_date"]);
  });

  it("parses nested fields", () => {
    const spec = parser.parse("recipient(display_name,uei)");
    expect(spec.fields).toHaveLength(1);
    const [recipient] = spec.fields;
    expect(recipient.name).toBe("recipient");
    expect(recipient.nestedFields?.map((f) => f.name)).toEqual(["display_name", "uei"]);
  });

  it("parses aliases", () => {
    const spec = parser.parse("recipient::vendor(display_name)");
    expect(spec.fields[0].name).toBe("recipient");
    expect(spec.fields[0].alias).toBe("vendor");
  });

  it("supports wildcard fields", () => {
    const spec = parser.parse("*");
    expect(spec.fields[0].name).toBe("*");
    expect(spec.fields[0].isWildcard).toBe(true);
  });

  it("throws on invalid syntax", () => {
    expect(() => parser.parse("key,")).toThrow(ShapeParseError);
    expect(() => parser.parse("(),key")).toThrow(ShapeParseError);
  });

  it("can attach flat/flat_lists flags", () => {
    const spec = parser.parseWithFlags("key,piid", true, false);
    expect(spec.isFlat).toBe(true);
    expect(spec.isFlatLists).toBe(false);
    expect(spec.fields.map((f) => f.name)).toEqual(["key", "piid"]);
  });
});
