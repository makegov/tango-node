import { parseDecimal } from "../../src/utils/number.js";

describe("parseDecimal", () => {
  it("returns string for numeric input", () => {
    expect(parseDecimal(123.45)).toBe("123.45");
  });

  it("returns the string value unchanged", () => {
    expect(parseDecimal("123.45")).toBe("123.45");
  });

  it("returns null for invalid values", () => {
    expect(parseDecimal(null)).toBeNull();
    expect(parseDecimal(undefined)).toBeNull();
    expect(parseDecimal("")).toBeNull();
    expect(parseDecimal(NaN)).toBeNull();
  });
});
