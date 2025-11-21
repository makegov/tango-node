import {
  ModelInstantiationError,
  ShapeError,
  ShapeParseError,
  ShapeValidationError,
  TangoAPIError,
  TangoAuthError,
  TangoNotFoundError,
  TangoRateLimitError,
  TangoValidationError,
} from "../../src/errors.js";

describe("Error classes", () => {
  it("should preserve message and name for TangoAPIError and subclasses", () => {
    const base = new TangoAPIError("base", 500, { foo: "bar" });
    expect(base).toBeInstanceOf(Error);
    expect(base).toBeInstanceOf(TangoAPIError);
    expect(base.name).toBe("TangoAPIError");
    expect(base.statusCode).toBe(500);
    expect(base.responseData).toEqual({ foo: "bar" });

    const auth = new TangoAuthError("auth", 401);
    expect(auth).toBeInstanceOf(TangoAPIError);
    expect(auth.name).toBe("TangoAuthError");
    expect(auth.statusCode).toBe(401);

    const notFound = new TangoNotFoundError();
    expect(notFound.name).toBe("TangoNotFoundError");

    const validation = new TangoValidationError("bad", 400);
    expect(validation).toBeInstanceOf(TangoAPIError);
    expect(validation.name).toBe("TangoValidationError");

    const rate = new TangoRateLimitError("slow down", 429);
    expect(rate.name).toBe("TangoRateLimitError");
    expect(rate.statusCode).toBe(429);
  });

  it("should expose shape-related error types", () => {
    const shapeErr = new ShapeError("shape");
    expect(shapeErr).toBeInstanceOf(Error);
    expect(shapeErr.name).toBe("ShapeError");

    const parseErr = new ShapeParseError("bad shape");
    expect(parseErr).toBeInstanceOf(ShapeError);
    expect(parseErr.name).toBe("ShapeParseError");

    const valErr = new ShapeValidationError("bad field");
    expect(valErr).toBeInstanceOf(ShapeError);
    expect(valErr.name).toBe("ShapeValidationError");

    const instErr = new ModelInstantiationError("bad model", "field", "str", 123);
    expect(instErr).toBeInstanceOf(ShapeError);
    expect(instErr.name).toBe("ModelInstantiationError");
    expect(instErr.fieldName).toBe("field");
    expect(instErr.expectedType).toBe("str");
    expect(instErr.actualValue).toBe(123);
  });
});
