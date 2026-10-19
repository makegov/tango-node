import { isRecord } from "./utils/guards.js";

export class TangoAPIError extends Error {
  readonly statusCode?: number;
  readonly responseData?: unknown;

  constructor(message: string, statusCode?: number, responseData?: unknown) {
    super(message);
    this.name = "TangoAPIError";
    this.statusCode = statusCode;
    this.responseData = responseData;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

export class TangoAuthError extends TangoAPIError {
  constructor(message = "Authentication error", statusCode?: number, responseData?: unknown) {
    super(message, statusCode, responseData);
    this.name = "TangoAuthError";
  }
}

export class TangoNotFoundError extends TangoAPIError {
  constructor(message = "Resource not found", statusCode?: number, responseData?: unknown) {
    super(message, statusCode, responseData);
    this.name = "TangoNotFoundError";
  }
}

export class TangoValidationError extends TangoAPIError {
  constructor(message = "Invalid request parameters", statusCode?: number, responseData?: unknown) {
    super(message, statusCode, responseData);
    this.name = "TangoValidationError";
  }

  /**
   * Structured validation issues from the API response.
   * For shape errors the API returns entries like `{"path": "tradeoff_process", "reason": "unknown_field"}`.
   * Empty array when the response carried no structured issues.
   */
  get issues(): Array<Record<string, unknown>> {
    const data = this.responseData;
    if (!isRecord(data)) return [];
    const val = data.issues;
    if (!Array.isArray(val)) return [];
    return val.filter(isRecord);
  }

  /**
   * The endpoint's valid field set, when the API includes one.
   */
  get availableFields(): Record<string, unknown> | null {
    const data = this.responseData;
    if (!isRecord(data)) return null;
    const val = data.available_fields;
    return isRecord(val) ? val : null;
  }
}

/**
 * Raised by `getEbuyAttachmentUrl()` when the attachment is an external link rather than a stored document.
 * `url` is the link's target, so a caller can follow it directly.
 */
export class TangoEbuyAttachmentLinkError extends TangoValidationError {
  readonly url: string;

  constructor(url: string, message = "This entry is an external link, not a stored document.", statusCode?: number, responseData?: unknown) {
    super(message, statusCode, responseData);
    this.name = "TangoEbuyAttachmentLinkError";
    this.url = url;
  }
}

// The API names the tripped rate in its 429 detail: "Rate limit exceeded for daily. Please try again in 16 hours, 58 minutes."
const RATE_NAME = /exceeded for ([\w-]+)/i;

/** Which limit a 429's detail names: `"daily"`, `"burst"`, or `null` when it names neither. */
function limitTypeFromDetail(detail: string): string | null {
  // Read the rate's name, not the whole sentence: a daily lockout's wait reads "16 hours, 58 minutes", and "minute" there is not a burst.
  const match = RATE_NAME.exec(detail);
  const text = (match ? match[1] : detail).toLowerCase();
  if (text.includes("daily") || /\bday\b/.test(text)) return "daily";
  if (text.includes("burst") || text.includes("minute")) return "burst";
  return null;
}

export class TangoRateLimitError extends TangoAPIError {
  private readonly headerLimitType: string | null;

  /** `limitType` is the server's `X-RateLimit-Type` header, which takes precedence over the body's detail when present. */
  constructor(message = "Rate limit exceeded", statusCode?: number, responseData?: unknown, limitType?: string | null) {
    super(message, statusCode, responseData);
    this.name = "TangoRateLimitError";
    this.headerLimitType = limitType || null;
  }

  /** Human-readable detail from the API response, when present. */
  get detail(): string | null {
    const data = this.responseData;
    if (!isRecord(data)) return null;
    return typeof data.detail === "string" ? data.detail : null;
  }

  /** Which limit was hit: `"daily"` or `"burst"`, from the `X-RateLimit-Type` header or else the response's detail; `null` when neither says. */
  get limitType(): string | null {
    if (this.headerLimitType) return this.headerLimitType;
    const detail = this.detail;
    return detail ? limitTypeFromDetail(detail) : null;
  }
}

export class TangoTimeoutError extends TangoAPIError {
  constructor(message = "Request timed out", statusCode?: number, responseData?: unknown) {
    super(message, statusCode, responseData);
    this.name = "TangoTimeoutError";
  }
}

export class ShapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShapeError";

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

export class ShapeValidationError extends ShapeError {
  constructor(message: string) {
    super(message);
    this.name = "ShapeValidationError";
  }
}

export class ShapeParseError extends ShapeError {
  constructor(message: string) {
    super(message);
    this.name = "ShapeParseError";
  }
}

export class TypeGenerationError extends ShapeError {
  constructor(message: string) {
    super(message);
    this.name = "TypeGenerationError";
  }
}

export class ModelInstantiationError extends ShapeError {
  readonly fieldName?: string | null;
  readonly expectedType?: string | null;
  readonly actualValue?: unknown;

  constructor(message: string, fieldName?: string | null, expectedType?: string | null, actualValue?: unknown) {
    super(message);
    this.name = "ModelInstantiationError";
    this.fieldName = fieldName;
    this.expectedType = expectedType;
    this.actualValue = actualValue;
  }
}
