import type { Request } from "express";
import { z } from "zod";
import { AppError } from "./errors.js";

/** Parses `input` with `schema`, turning failures into a 400 with per-field details. */
export function parseOrThrow<Schema extends z.ZodType>(schema: Schema, input: unknown): z.infer<Schema> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      field: issue.path.join(".") || null,
      message: issue.message,
    }));
    throw AppError.badRequest("VALIDATION_FAILED", "Request validation failed", details);
  }
  return result.data;
}

export const idParamSchema = z.object({ id: z.uuid() });

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

/**
 * Reads the `Idempotency-Key` header required on every money-moving request.
 * Retrying with the same key replays the original result instead of
 * performing the operation again.
 */
export function requireIdempotencyKey(req: Request): string {
  const key = req.get("Idempotency-Key");
  if (!key) {
    throw AppError.badRequest("IDEMPOTENCY_KEY_REQUIRED", "The Idempotency-Key header is required");
  }
  if (!IDEMPOTENCY_KEY_PATTERN.test(key)) {
    throw AppError.badRequest(
      "VALIDATION_FAILED",
      "Idempotency-Key must be 8-128 characters of letters, digits, '-' or '_'",
    );
  }
  return key;
}

// ---------------------------------------------------------------------------
// Cursor pagination
// ---------------------------------------------------------------------------

export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.uuid().optional(),
});

export type PageRequest = z.infer<typeof paginationQuerySchema>;

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/**
 * Prisma arguments for keyset pagination, newest first. `createdAt` alone is
 * not unique, so `id` breaks ties and makes the order total.
 */
export function pageQueryArgs({ limit, cursor }: PageRequest) {
  return {
    take: limit + 1, // fetch one extra row to learn whether another page exists
    ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }],
  };
}

export function toPage<Row extends { id: string }, Item>(
  rows: Row[],
  { limit }: PageRequest,
  toItem: (row: Row) => Item,
): Page<Item> {
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  return {
    items: pageRows.map(toItem),
    nextCursor: hasMore ? (pageRows.at(-1)?.id ?? null) : null,
  };
}
