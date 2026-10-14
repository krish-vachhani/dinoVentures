/**
 * Every error code the API can return. Clients branch on `code`, never on
 * `message`, so messages can change freely.
 */
export type ErrorCode =
  | "VALIDATION_FAILED"
  | "INVALID_JSON"
  | "UNAUTHENTICATED"
  | "INVALID_CREDENTIALS"
  | "ACCOUNT_DISABLED"
  | "EMAIL_TAKEN"
  | "NOT_FOUND"
  | "IDEMPOTENCY_KEY_REQUIRED"
  | "IDEMPOTENCY_KEY_REUSED"
  | "PACKAGE_UNAVAILABLE"
  | "PRODUCT_UNAVAILABLE"
  | "INSUFFICIENT_FUNDS"
  | "ALREADY_OWNED"
  | "INVALID_SIGNATURE"
  | "UNKNOWN_PAYMENT"
  | "PAYMENT_MISMATCH"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

/** An expected, client-facing failure. Anything else is treated as a 500. */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }

  static badRequest(code: ErrorCode, message: string, details?: unknown) {
    return new AppError(400, code, message, details);
  }

  static unauthorized(code: ErrorCode, message: string) {
    return new AppError(401, code, message);
  }

  static forbidden(code: ErrorCode, message: string) {
    return new AppError(403, code, message);
  }

  static notFound(message: string, code: ErrorCode = "NOT_FOUND") {
    return new AppError(404, code, message);
  }

  static conflict(code: ErrorCode, message: string, details?: unknown) {
    return new AppError(409, code, message, details);
  }

  static unprocessable(code: ErrorCode, message: string, details?: unknown) {
    return new AppError(422, code, message, details);
  }
}
