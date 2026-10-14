import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { findUnreconciledWallets, getBalance } from "./helpers/db.js";
import { createProduct, fundWallet, idempotencyKey, newApp, purchase, registerUser } from "./helpers/fixtures.js";

describe("FR-6 purchasing products", () => {
  it("debits the price, records the order and ledger entry, and grants ownership", async () => {
    const user = await registerUser();
    await fundWallet(user, 1_000);
    const product = await createProduct({ name: "Neon Ronin", priceCoins: 800 });

    const response = await purchase(user, product.id).expect(201);

    expect(response.body.wallet.balance).toBe(200);
    expect(response.body.order).toMatchObject({
      productId: product.id,
      productName: "Neon Ronin",
      quantity: 1,
      unitPriceCoins: 800,
      totalCoins: 800,
      status: "COMPLETED",
    });

    const debit = await prisma.walletTransaction.findUniqueOrThrow({ where: { orderId: response.body.order.id } });
    expect(debit).toMatchObject({ type: "PURCHASE_DEBIT", amount: -800, balanceAfter: 200 });

    const entitlement = await prisma.entitlement.findUniqueOrThrow({
      where: { userId_productId: { userId: user.id, productId: product.id } },
    });
    expect(entitlement.orderId).toBe(response.body.order.id);
    expect(await findUnreconciledWallets()).toEqual([]);
  });

  it("fails without enough coins and leaves no trace", async () => {
    const user = await registerUser();
    await fundWallet(user, 100);
    const product = await createProduct({ priceCoins: 101 });

    const response = await purchase(user, product.id).expect(409);

    expect(response.body.error).toMatchObject({ code: "INSUFFICIENT_FUNDS", details: { required: 101, balance: 100 } });
    expect(await getBalance(user.id)).toBe(100);
    expect(await prisma.order.count()).toBe(0);
    expect(await prisma.entitlement.count()).toBe(0);
  });

  it("allows spending the exact balance down to zero", async () => {
    const user = await registerUser();
    await fundWallet(user, 300);
    const product = await createProduct({ priceCoins: 300 });

    const response = await purchase(user, product.id).expect(201);
    expect(response.body.wallet.balance).toBe(0);
  });

  it("rejects buying a product the user already owns", async () => {
    const user = await registerUser();
    await fundWallet(user, 1_000);
    const product = await createProduct({ priceCoins: 100 });
    await purchase(user, product.id).expect(201);

    const response = await purchase(user, product.id).expect(409);

    expect(response.body.error.code).toBe("ALREADY_OWNED");
    expect(await getBalance(user.id)).toBe(900);
  });

  it("rejects inactive products", async () => {
    const user = await registerUser();
    await fundWallet(user, 1_000);
    const product = await createProduct({ active: false });

    const response = await purchase(user, product.id).expect(422);

    expect(response.body.error.code).toBe("PRODUCT_UNAVAILABLE");
    expect(await getBalance(user.id)).toBe(1_000);
  });

  it("rejects a battle pass whose season has ended", async () => {
    const user = await registerUser();
    await fundWallet(user, 1_000);
    const expired = await createProduct({
      category: "BATTLE_PASS",
      seasonStartsAt: new Date("2020-01-01T00:00:00Z"),
      seasonEndsAt: new Date("2020-03-01T00:00:00Z"),
    });

    const response = await purchase(user, expired.id).expect(422);
    expect(response.body.error.code).toBe("PRODUCT_UNAVAILABLE");
  });

  it("rejects a client-supplied price or quantity", async () => {
    const user = await registerUser();
    await fundWallet(user, 1_000);
    const product = await createProduct({ priceCoins: 500 });

    const response = await user.agent
      .post("/api/orders")
      .set("Idempotency-Key", idempotencyKey())
      .send({ productId: product.id, priceCoins: 1, quantity: 10 })
      .expect(400);

    expect(response.body.error.code).toBe("VALIDATION_FAILED");
    expect(await getBalance(user.id)).toBe(1_000);
  });

  it("records a seasonal entitlement that expires with the season", async () => {
    const user = await registerUser();
    await fundWallet(user, 1_000);
    const seasonEnd = new Date("2099-06-30T23:59:59Z");
    const pass = await createProduct({ category: "BATTLE_PASS", seasonCode: "S9", seasonEndsAt: seasonEnd });

    await purchase(user, pass.id).expect(201);

    const entitlement = await prisma.entitlement.findFirstOrThrow({ where: { userId: user.id } });
    expect(entitlement).toMatchObject({ seasonCode: "S9", validUntil: seasonEnd });
  });

  it("keeps the recorded price when the catalog price changes later", async () => {
    const user = await registerUser();
    await fundWallet(user, 1_000);
    const product = await createProduct({ priceCoins: 400 });
    const { body } = await purchase(user, product.id).expect(201);

    await prisma.product.update({ where: { id: product.id }, data: { priceCoins: 9_999 } });

    const order = await user.agent.get(`/api/orders/${body.order.id}`).expect(200);
    expect(order.body.order).toMatchObject({ unitPriceCoins: 400, totalCoins: 400 });
    const debit = await prisma.walletTransaction.findUniqueOrThrow({ where: { orderId: body.order.id } });
    expect(debit.amount).toBe(-400);
  });
});

describe("FR-6 idempotent retries", () => {
  it("replays the original order instead of charging twice", async () => {
    const user = await registerUser();
    await fundWallet(user, 1_000);
    const product = await createProduct({ priceCoins: 250 });
    const key = idempotencyKey();

    const first = await purchase(user, product.id, key).expect(201);
    const retry = await purchase(user, product.id, key).expect(200);

    expect(retry.headers["idempotent-replayed"]).toBe("true");
    expect(retry.body.order.id).toBe(first.body.order.id);
    expect(retry.body.wallet.balance).toBe(750);
    expect(await prisma.order.count()).toBe(1);
    expect(await prisma.walletTransaction.count({ where: { type: "PURCHASE_DEBIT" } })).toBe(1);
  });

  it("rejects reusing a key for a different product", async () => {
    const user = await registerUser();
    await fundWallet(user, 1_000);
    const [first, second] = [await createProduct(), await createProduct()];
    const key = idempotencyKey();

    await purchase(user, first.id, key).expect(201);
    const response = await purchase(user, second.id, key).expect(422);

    expect(response.body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
    expect(await prisma.order.count()).toBe(1);
  });

  it("requires an Idempotency-Key", async () => {
    const user = await registerUser();
    const product = await createProduct();

    const response = await user.agent.post("/api/orders").send({ productId: product.id }).expect(400);
    expect(response.body.error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
  });
});

describe("FR-6 concurrency", () => {
  it("never overdraws the wallet under concurrent purchases", async () => {
    const user = await registerUser();
    await fundWallet(user, 500);
    // Ten 100-coin products, but only enough coins for five.
    const products = await Promise.all(Array.from({ length: 10 }, () => createProduct({ priceCoins: 100 })));

    const responses = await Promise.all(products.map((product) => purchase(user, product.id)));
    const statuses = responses.map((response) => response.status);

    expect(statuses.filter((status) => status === 201)).toHaveLength(5);
    expect(statuses.filter((status) => status === 409)).toHaveLength(5);
    expect(responses.filter((r) => r.status === 409).every((r) => r.body.error.code === "INSUFFICIENT_FUNDS")).toBe(true);
    expect(await getBalance(user.id)).toBe(0);
    expect(await prisma.entitlement.count()).toBe(5);
    expect(await findUnreconciledWallets()).toEqual([]);
  });

  it("grants a product once when two different requests race to buy it", async () => {
    const user = await registerUser();
    await fundWallet(user, 1_000);
    const product = await createProduct({ priceCoins: 100 });

    const responses = await Promise.all(Array.from({ length: 5 }, () => purchase(user, product.id)));
    const statuses = responses.map((response) => response.status).sort();

    expect(statuses).toEqual([201, 409, 409, 409, 409]);
    expect(responses.filter((r) => r.status === 409).every((r) => r.body.error.code === "ALREADY_OWNED")).toBe(true);
    expect(await getBalance(user.id)).toBe(900);
    expect(await prisma.order.count()).toBe(1);
    expect(await findUnreconciledWallets()).toEqual([]);
  });

  it("creates one order when the same request is sent concurrently", async () => {
    const user = await registerUser();
    await fundWallet(user, 1_000);
    const product = await createProduct({ priceCoins: 100 });
    const key = idempotencyKey();

    const responses = await Promise.all(Array.from({ length: 5 }, () => purchase(user, product.id, key)));

    expect(responses.every((response) => [200, 201].includes(response.status))).toBe(true);
    expect(new Set(responses.map((response) => response.body.order.id)).size).toBe(1);
    expect(await getBalance(user.id)).toBe(900);
    expect(await prisma.order.count()).toBe(1);
  });
});

describe("FR-6 atomicity", () => {
  // Makes the last write of the purchase transaction (the entitlement insert)
  // fail at the database, after the debit, order and ledger rows were written.
  async function breakEntitlementInserts() {
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION test_fail_entitlement() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'simulated failure'; END;
      $$ LANGUAGE plpgsql;
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER test_fail_entitlement BEFORE INSERT ON entitlements
      FOR EACH ROW EXECUTE FUNCTION test_fail_entitlement();
    `);
  }

  afterEach(async () => {
    await prisma.$executeRawUnsafe("DROP TRIGGER IF EXISTS test_fail_entitlement ON entitlements");
    await prisma.$executeRawUnsafe("DROP FUNCTION IF EXISTS test_fail_entitlement()");
  });

  it("rolls back the debit, order and ledger entry if any step fails", async () => {
    const app = newApp();
    const user = await registerUser(app);
    await fundWallet(user, 1_000);
    const product = await createProduct({ priceCoins: 300 });
    await breakEntitlementInserts();

    const response = await purchase(user, product.id).expect(500);

    expect(response.body.error.code).toBe("INTERNAL_ERROR");
    expect(await getBalance(user.id)).toBe(1_000);
    expect(await prisma.order.count()).toBe(0);
    expect(await prisma.walletTransaction.count({ where: { type: "PURCHASE_DEBIT" } })).toBe(0);
    expect(await prisma.entitlement.count()).toBe(0);
    expect(await findUnreconciledWallets()).toEqual([]);
  });
});
