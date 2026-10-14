import type { NextFunction, Request, Response } from "express";
import { AppError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";

interface ErrorBody {
  error: { code: string; message: string; details?: unknown };
}

function isJsonParseError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "type" in error &&
    (error as { type: unknown }).type === "entity.parse.failed"
  );
}

export function notFoundHandler(req: Request, res: Response<ErrorBody>) {
  res.status(404).json({ error: { code: "NOT_FOUND", message: `No route for ${req.method} ${req.path}` } });
}

/**
 * Converts thrown errors into the API's error envelope. Expected failures
 * (AppError) keep their status and code. Anything else is logged and returned
 * as an opaque 500, so internals never leak to clients.
 */
export function errorHandler(error: unknown, req: Request, res: Response<ErrorBody>, _next: NextFunction) {
  if (error instanceof AppError) {
    res.status(error.status).json({
      error: { code: error.code, message: error.message, ...(error.details !== undefined && { details: error.details }) },
    });
    return;
  }

  if (isJsonParseError(error)) {
    res.status(400).json({ error: { code: "INVALID_JSON", message: "Request body is not valid JSON" } });
    return;
  }

  logger.error({ err: error, method: req.method, path: req.path }, "Unhandled error");
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
}
