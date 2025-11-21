import { ShapeParser } from "../../src/shapes/parser.js";
import { ModelFactory } from "../../src/shapes/factory.js";

describe("ModelFactory", () => {
  const parser = new ShapeParser();
  const factory = new ModelFactory();

  it("creates shaped Contract objects with nested recipient", () => {
    const spec = parser.parse(
      "key,piid,award_date,total_contract_value,recipient(display_name,uei)",
    );
    const raw = {
      key: "C-1",
      piid: "PIID-1",
      award_date: "2024-01-15",
      total_contract_value: "12345.67",
      recipient: {
        display_name: "Acme Corp",
        uei: "UEI123",
      },
    };

    const shaped = factory.createOne("Contract", spec, raw);

    expect(shaped.key).toBe("C-1");
    expect(shaped.piid).toBe("PIID-1");
    expect(shaped.total_contract_value).toBe("12345.67");
    expect(shaped.award_date).toBeInstanceOf(Date);
    expect(shaped.recipient.display_name).toBe("Acme Corp");
    expect(shaped.recipient.uei).toBe("UEI123");
  });

  it("handles list fields", () => {
    // Use the Entity model which has list fields (naics_codes, psc_codes, etc.)
    const spec = parser.parse("uei,naics_codes,psc_codes");
    const raw = {
      uei: "UEI123",
      naics_codes: ["541511", "541512"],
      psc_codes: ["D302"],
    };

    const shaped = factory.createOne("Entity", spec, raw);
    expect(shaped.uei).toBe("UEI123");
    expect(shaped.naics_codes).toEqual(["541511", "541512"]);
    expect(shaped.psc_codes).toEqual(["D302"]);
  });
});
