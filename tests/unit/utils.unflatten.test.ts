import { unflattenResponse } from "../../src/utils/unflatten.js";

describe("unflattenResponse", () => {
  it("returns a shallow copy when there are no dotted keys", () => {
    const src = { a: 1, b: 2 };
    const result = unflattenResponse(src);
    expect(result).toEqual(src);
    expect(result).not.toBe(src);
  });

  it("unflattens simple dotted keys", () => {
    const src = {
      "recipient.display_name": "Acme",
      "recipient.uei": "UEI123",
      piid: "PIID-1",
    };

    const result = unflattenResponse(src);

    expect(result).toEqual({
      recipient: {
        display_name: "Acme",
        uei: "UEI123",
      },
      piid: "PIID-1",
    });
  });

  it("handles deeper nesting", () => {
    const src = {
      "a.b.c": 1,
      "a.b.d": 2,
      x: 3,
    };

    const result = unflattenResponse(src);

    expect(result).toEqual({
      a: {
        b: {
          c: 1,
          d: 2,
        },
      },
      x: 3,
    });
  });

  it("handles collisions by overwriting primitives with objects", () => {
    const src = {
      a: 1,
      "a.b": 2,
    };

    const result = unflattenResponse(src);

    expect(result).toEqual({
      a: {
        b: 2,
      },
    });
  });
});
