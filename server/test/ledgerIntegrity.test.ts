import { describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { findUnreconciledWallets } from "./helpers/db.js";
import { createCoinPackage, createProduct, fundWallet, purchase, registerUser, startTopup } from "./helpers/fixtures.js";

/**
 * These tests bypass the API and attack the database directly, proving the
 * invariants hold even if application code has a bug.
 */
describe("database-level guarantees", () => {
  it("keeps the ledger append-only", async () => {
    const user = await registerUser();
    await fundWallet(user, 100);
    const entry = await prisma.walletTransaction.findFirstOrThrow();

    await expect(
      prisma.walletTransaction.update({ where: { id: entry.id }, data: { amount: 1_000_000 } }),
    ).rejects.toThrow(/append-only/);
    await expect(prisma.walletTransaction.delete({ where: { id: entry.id } })).rejects.toThrow(/append-only/);
  });

  it("refuses a negative wallet balance", async () => {
    const user = await registerUser();
    await expect(
      prisma.wallet.update({ where: { userId: user.id }, data: { balance: -1 } }),
    ).rejects.toThrow(/wallets_balance_non_negative/);
  });

  it("refuses a second ledger credit for the same top-up", async () => {
    const user = await registerUser();
    await fundWallet(user, 100);
    const credit = await prisma.walletTransaction.findFirstOrThrow();

    await expect(
      prisma.walletTransaction.create({
        data: {
          walletId: credit.walletId,
          type: "TOPUP_CREDIT",
          amount: 100,
          balanceAfter: 200,
          topupId: credit.topupId,
          description: "duplicate credit",
        },
      }),
    ).rejects.toThrow();
  });

  it("refuses to mark an unpaid top-up as credited", async () => {
    const user = await registerUser();
    const topup = await startTopup(user, (await createCoinPackage()).id);

    await expect(
      prisma.topup.update({ where: { id: topup.id }, data: { creditedAt: new Date() } }),
    ).rejects.toThrow(/topups_credit_requires_success/);
  });

  it("refuses ledger entries with the wrong sign for their type", async () => {
    const user = await registerUser();
    await fundWallet(user, 100);
    const product = await createProduct({ priceCoins: 50 });
    const { body } = await purchase(user, product.id).expect(201);
    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: user.id } });

    await expect(
      prisma.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: "PURCHASE_DEBIT",
          amount: 50, // a "debit" that adds coins
          balanceAfter: 100,
          orderId: body.order.id,
          description: "bogus",
        },
      }),
    ).rejects.toThrow();
  });

  it("can rebuild every balance from the ledger after mixed activity", async () => {
    const users = await Promise.all([registerUser(), registerUser(), registerUser()]);
    const products = await Promise.all([createProduct({ priceCoins: 70 }), createProduct({ priceCoins: 130 })]);

    for (const user of users) {
      await fundWallet(user, 150);
      await fundWallet(user, 50);
      await Promise.all(products.map((product) => purchase(user, product.id)));
    }

    expect(await findUnreconciledWallets()).toEqual([]);
  });
});
