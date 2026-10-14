import { EventEmitter } from "node:events";
import { afterAll, beforeEach } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { resetDatabase } from "./helpers/db.js";

// Every test starts from an empty database.
beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

// supertest attaches a listener to the shared server for every in-flight
// request; the concurrency tests deliberately run more than Node's default 10.
EventEmitter.defaultMaxListeners = 50;
