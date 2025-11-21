import { ModelFactory } from "../../src/shapes/factory.js";
import { ShapeParser } from "../../src/shapes/parser.js";
import type { Contract } from "../../src/models/Contract.js";
import type { Forecast } from "../../src/models/Forecast.js";

describe("Dynamic models", () => {
  const parser = new ShapeParser();
  const factory = new ModelFactory();

  it("creates shaped Contract objects with parsed dates and nested recipient", () => {
    const spec = parser.parse("key,piid,award_date,recipient(display_name)");
    const raw = {
      key: "C-100",
      piid: "PIID-100",
      award_date: "2024-02-01",
      recipient: { display_name: "Acme" },
    };

    const shaped = factory.createOne("Contract", spec, raw) as Contract;
    expect(shaped.piid).toBe("PIID-100");
    expect(shaped.award_date).toBeInstanceOf(Date);
    expect(shaped.recipient?.display_name).toBe("Acme");
  });

  it("creates shaped Forecast objects and parses date fields", () => {
    const spec = parser.parse("id,title,anticipated_award_date,status");
    const raw = {
      id: 42,
      title: "Cloud migration",
      anticipated_award_date: "2024-03-15",
      status: "Planned",
    };

    const shaped = factory.createOne("Forecast", spec, raw) as Forecast;
    expect(shaped.id).toBe(42);
    expect(shaped.title).toBe("Cloud migration");
    expect(shaped.anticipated_award_date).toBeInstanceOf(Date);
  });
});
