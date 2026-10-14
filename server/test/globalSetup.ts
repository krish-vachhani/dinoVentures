import { execSync } from "node:child_process";
import pg from "pg";

/**
 * Runs once before the whole suite: rebuilds the test database from the
 * real migrations, so tests exercise the exact schema production uses,
 * including CHECK constraints and triggers.
 */
export default async function setup() {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  if (!databaseUrl) throw new Error("TEST_DATABASE_URL is not set");

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
  } finally {
    await client.end();
  }

  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "pipe",
  });
}
