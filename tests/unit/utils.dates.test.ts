import { parseDate, parseDateTime } from "../../src/utils/dates.js";

describe("date parsing helpers", () => {
  it("parses ISO date strings into Date objects", () => {
    const d = parseDate("2024-01-15");
    expect(d).toBeInstanceOf(Date);
    expect(d?.toISOString().startsWith("2024-01-15")).toBe(true);
  });

  it("returns null for invalid or empty input", () => {
    expect(parseDate(null)).toBeNull();
    expect(parseDate("")).toBeNull();
    expect(parseDate("not-a-date")).toBeNull();
  });

  it("parseDateTime is currently an alias of parseDate", () => {
    const d = parseDateTime("2024-01-15T12:34:56Z");
    expect(d).toBeInstanceOf(Date);
  });
});
