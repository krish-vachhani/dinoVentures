import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../generated/prisma/client.js";
import { config } from "../config.js";

const adapter = new PrismaPg({
  connectionString: config.database.url,
  max: config.database.poolSize,
});

export const prisma = new PrismaClient({ adapter });

export type TransactionClient = Prisma.TransactionClient;

/**
 * Runs `work` inside a single database transaction (READ COMMITTED). Either
 * every write inside it commits, or none do.
 *
 * Correctness under concurrency comes from conditional writes
 * (e.g. `UPDATE wallets ... WHERE balance >= price`) and unique constraints,
 * not from the isolation level, so READ COMMITTED is sufficient.
 */
export function runInTransaction<T>(work: (tx: TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(work, {
    maxWait: 5_000, // time allowed to acquire a pooled connection
    timeout: 10_000, // upper bound for the transaction itself
  });
}

/** True when `error` is a unique-constraint violation (Prisma code P2002). */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
