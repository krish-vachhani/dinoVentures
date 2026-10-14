import { randomUUID } from "node:crypto";
import supertest from "supertest";
import { createApp, type AppOptions } from "../../src/app.js";
import type { ProductCategory } from "../../src/generated/prisma/enums.js";
import { prisma } from "../../src/lib/prisma.js";

export type Agent = ReturnType<typeof supertest.agent>;

export interface TestUser {
  id: string;
  email: string;
  /** A supertest agent that keeps this user's session cookie. */
  agent: Agent;
}

export function newApp(options?: AppOptions) {
  return createApp({ enablePaymentSimulation: true, ...options });
}

export function idempotencyKey() {
  return randomUUID();
}

let userCounter = 0;

export async function registerUser(app = newApp(), overrides: { email?: string; password?: string } = {}): Promise<TestUser> {
  userCounter += 1;
  const email = overrides.email ?? `player${userCounter}-${randomUUID().slice(0, 8)}@example.com`;
  const agent = supertest.agent(app);

  const response = await agent
    .post("/api/auth/register")
    .send({ email, password: overrides.password ?? "correct-horse-battery", displayName: `Player ${userCounter}` })
    .expect(201);

  return { id: response.body.user.id as string, email, agent };
}

export async function createCoinPackage(overrides: Partial<{
  code: string;
  name: string;
  baseCoins: number;
  bonusCoins: number;
  priceMinor: number;
  currency: string;
  active: boolean;
}> = {}) {
  return prisma.coinPackage.create({
    data: {
      code: overrides.code ?? `pkg-${randomUUID().slice(0, 8)}`,
      name: overrides.name ?? "Test Pack",
      baseCoins: overrides.baseCoins ?? 1_000,
      bonusCoins: overrides.bonusCoins ?? 0,
      priceMinor: overrides.priceMinor ?? 99_900,
      currency: overrides.currency ?? "INR",
      active: overrides.active ?? true,
    },
  });
}

export async function createProduct(overrides: Partial<{
  name: string;
  category: ProductCategory;
  priceCoins: number;
  active: boolean;
  seasonCode: string;
  seasonStartsAt: Date;
  seasonEndsAt: Date;
}> = {}) {
  const category = overrides.category ?? "SKIN";
  const isBattlePass = category === "BATTLE_PASS";
  const sku = `sku-${randomUUID().slice(0, 8)}`;

  return prisma.product.create({
    data: {
      sku,
      name: overrides.name ?? `Product ${sku}`,
      description: "Test product",
      category,
      imageUrl: `/images/products/${sku}.svg`,
      priceCoins: overrides.priceCoins ?? 100,
      active: overrides.active ?? true,
      seasonCode: overrides.seasonCode ?? (isBattlePass ? "S1" : null),
      seasonStartsAt: overrides.seasonStartsAt ?? (isBattlePass ? new Date("2026-01-01T00:00:00Z") : null),
      seasonEndsAt: overrides.seasonEndsAt ?? (isBattlePass ? new Date("2099-01-01T00:00:00Z") : null),
    },
  });
}

/** Starts a top-up for `packageId` and returns the created top-up. */
export async function startTopup(user: TestUser, packageId: string, key = idempotencyKey()) {
  const response = await user.agent
    .post("/api/topups")
    .set("Idempotency-Key", key)
    .send({ packageId })
    .expect(201);
  return response.body.topup as { id: string; paymentRef: string; priceMinor: number; currency: string; coinsTotal: number };
}

/** Gives `user` exactly `coins` Gold Coins through the real top-up flow. */
export async function fundWallet(user: TestUser, coins: number) {
  const pkg = await createCoinPackage({ baseCoins: coins });
  const topup = await startTopup(user, pkg.id);
  await user.agent.post(`/api/topups/${topup.id}/simulate-payment`).send({ outcome: "success" }).expect(200);
}

export function purchase(user: TestUser, productId: string, key = idempotencyKey()) {
  return user.agent.post("/api/orders").set("Idempotency-Key", key).send({ productId });
}
