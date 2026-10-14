import { describe, expect, it } from "vitest";
import { createCoinPackage, createProduct, fundWallet, newApp, purchase, registerUser, startTopup } from "./helpers/fixtures.js";

describe("FR-8 wallet transaction history", () => {
  it("distinguishes top-ups from purchases and links each to its source", async () => {
    const user = await registerUser();
    await fundWallet(user, 1_000);
    const product = await createProduct({ name: "Salute", priceCoins: 100 });
    const { body } = await purchase(user, product.id).expect(201);

    const response = await user.agent.get("/api/wallet/transactions").expect(200);
    const [debit, credit] = response.body.items;

    expect(debit).toMatchObject({ type: "PURCHASE_DEBIT", amount: -100, balanceAfter: 900, orderId: body.order.id, topupId: null });
    expect(credit).toMatchObject({ type: "TOPUP_CREDIT", amount: 1_000, balanceAfter: 1_000, orderId: null });
    expect(credit.topupId).toEqual(expect.any(String));
  });

  it("does not list failed payments as coin credits", async () => {
    const user = await registerUser();
    const topup = await startTopup(user, (await createCoinPackage()).id);
    await user.agent.post(`/api/topups/${topup.id}/simulate-payment`).send({ outcome: "failure" }).expect(200);

    const ledger = await user.agent.get("/api/wallet/transactions").expect(200);
    const payments = await user.agent.get("/api/topups").expect(200);

    expect(ledger.body.items).toEqual([]);
    expect(payments.body.items).toHaveLength(1);
    expect(payments.body.items[0].paymentStatus).toBe("FAILED");
  });

  it("paginates newest first with a cursor, without gaps or duplicates", async () => {
    const user = await registerUser();
    for (let i = 0; i < 5; i += 1) await fundWallet(user, 10);

    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const query: string = cursor ? `?limit=2&cursor=${cursor}` : "?limit=2";
      const response = await user.agent.get(`/api/wallet/transactions${query}`).expect(200);
      seen.push(...response.body.items.map((item: { id: string }) => item.id));
      cursor = response.body.nextCursor;
      pages += 1;
    } while (cursor);

    expect(pages).toBe(3);
    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5);

    const all = await user.agent.get("/api/wallet/transactions?limit=100").expect(200);
    expect(all.body.items.map((item: { id: string }) => item.id)).toEqual(seen);
    expect(all.body.items.map((item: { balanceAfter: number }) => item.balanceAfter)).toEqual([50, 40, 30, 20, 10]);
  });

  it("validates pagination parameters", async () => {
    const user = await registerUser();
    await user.agent.get("/api/wallet/transactions?limit=0").expect(400);
    await user.agent.get("/api/wallet/transactions?limit=500").expect(400);
    await user.agent.get("/api/wallet/transactions?cursor=not-a-uuid").expect(400);
  });
});

describe("FR-8 purchase history", () => {
  it("lists orders with the price paid at the time, newest first, paginated", async () => {
    const user = await registerUser();
    await fundWallet(user, 1_000);
    const first = await createProduct({ name: "First", priceCoins: 100 });
    const second = await createProduct({ name: "Second", priceCoins: 200 });
    await purchase(user, first.id).expect(201);
    await purchase(user, second.id).expect(201);

    const page1 = await user.agent.get("/api/orders?limit=1").expect(200);
    const page2 = await user.agent.get(`/api/orders?limit=1&cursor=${page1.body.nextCursor}`).expect(200);

    expect(page1.body.items[0]).toMatchObject({ productName: "Second", unitPriceCoins: 200, quantity: 1, status: "COMPLETED" });
    expect(page2.body.items[0]).toMatchObject({ productName: "First", unitPriceCoins: 100 });
    expect(page2.body.nextCursor).toBeNull();
  });
});

describe("FR-7 inventory", () => {
  it("lists owned products traced to the order that granted them", async () => {
    const user = await registerUser();
    await fundWallet(user, 1_000);
    const skin = await createProduct({ category: "SKIN", priceCoins: 100 });
    const { body } = await purchase(user, skin.id).expect(201);

    const response = await user.agent.get("/api/inventory").expect(200);

    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0]).toMatchObject({
      orderId: body.order.id,
      validUntil: null,
      isActive: true,
      product: { id: skin.id, category: "SKIN" },
    });
  });

  it("does not include products from failed purchases", async () => {
    const user = await registerUser();
    const product = await createProduct({ priceCoins: 100 });
    await purchase(user, product.id).expect(409); // no coins

    const response = await user.agent.get("/api/inventory").expect(200);
    expect(response.body.items).toEqual([]);
  });
});

describe("FR-1 account isolation", () => {
  it("never shows one user's data to another", async () => {
    const app = newApp();
    const alice = await registerUser(app);
    const bob = await registerUser(app);
    await fundWallet(alice, 1_000);
    const product = await createProduct({ priceCoins: 100 });
    const { body } = await purchase(alice, product.id).expect(201);

    // Bob cannot fetch Alice's order by id...
    await bob.agent.get(`/api/orders/${body.order.id}`).expect(404);

    // ...and every listing Bob sees is scoped to Bob.
    expect((await bob.agent.get("/api/wallet").expect(200)).body.wallet.balance).toBe(0);
    expect((await bob.agent.get("/api/wallet/transactions").expect(200)).body.items).toEqual([]);
    expect((await bob.agent.get("/api/orders").expect(200)).body.items).toEqual([]);
    expect((await bob.agent.get("/api/topups").expect(200)).body.items).toEqual([]);
    expect((await bob.agent.get("/api/inventory").expect(200)).body.items).toEqual([]);
  });
});
