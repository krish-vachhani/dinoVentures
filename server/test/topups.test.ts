import supertest from "supertest";
import { describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import {
  buildPaymentEvent,
  signPayload,
  SIGNATURE_HEADER,
  type PaymentEvent,
} from "../src/modules/payments/mockPaymentProvider.js";
import { findUnreconciledWallets, getBalance } from "./helpers/db.js";
import { createCoinPackage, idempotencyKey, newApp, registerUser, startTopup } from "./helpers/fixtures.js";

type App = ReturnType<typeof newApp>;

function sendWebhook(app: App, event: PaymentEvent, signature?: string) {
  const body = JSON.stringify(event);
  return supertest(app)
    .post("/api/webhooks/mock-payments")
    .set("Content-Type", "application/json")
    .set(SIGNATURE_HEADER, signature ?? signPayload(body))
    .send(body);
}

interface TopupRef {
  paymentRef: string;
  priceMinor: number;
  currency: string;
}

/** The event the provider would send for this top-up. */
function eventFor(topup: TopupRef, outcome: "success" | "failure", amountMinor = topup.priceMinor) {
  return buildPaymentEvent({ paymentRef: topup.paymentRef, amountMinor, currency: topup.currency, outcome });
}

function successEventFor(topup: TopupRef) {
  return eventFor(topup, "success");
}

describe("FR-4 starting a top-up", () => {
  it("snapshots the package's coins and price, and credits nothing yet", async () => {
    const app = newApp();
    const user = await registerUser(app);
    const pkg = await createCoinPackage({ name: "Gamer", baseCoins: 550, bonusCoins: 50, priceMinor: 49_900 });

    const topup = await startTopup(user, pkg.id);

    expect(topup).toMatchObject({
      packageName: "Gamer",
      coinsBase: 550,
      coinsBonus: 50,
      coinsTotal: 600,
      priceMinor: 49_900,
      currency: "INR",
      paymentStatus: "PENDING",
      creditedAt: null,
    });
    expect(await getBalance(user.id)).toBe(0);
  });

  it("ignores any coin amount or price the client tries to send", async () => {
    const app = newApp();
    const user = await registerUser(app);
    const pkg = await createCoinPackage({ baseCoins: 100, priceMinor: 9_900 });

    const response = await user.agent
      .post("/api/topups")
      .set("Idempotency-Key", idempotencyKey())
      .send({ packageId: pkg.id, coinsTotal: 1_000_000, priceMinor: 1 })
      .expect(201);

    expect(response.body.topup).toMatchObject({ coinsTotal: 100, priceMinor: 9_900 });
  });

  it("rejects an inactive package", async () => {
    const user = await registerUser();
    const pkg = await createCoinPackage({ active: false });

    const response = await user.agent
      .post("/api/topups")
      .set("Idempotency-Key", idempotencyKey())
      .send({ packageId: pkg.id })
      .expect(422);

    expect(response.body.error.code).toBe("PACKAGE_UNAVAILABLE");
  });

  it("requires an Idempotency-Key", async () => {
    const user = await registerUser();
    const pkg = await createCoinPackage();

    const response = await user.agent.post("/api/topups").send({ packageId: pkg.id }).expect(400);
    expect(response.body.error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
  });

  it("replays the original top-up when a request is retried with the same key", async () => {
    const user = await registerUser();
    const pkg = await createCoinPackage();
    const key = idempotencyKey();

    const first = await user.agent.post("/api/topups").set("Idempotency-Key", key).send({ packageId: pkg.id }).expect(201);
    const retry = await user.agent.post("/api/topups").set("Idempotency-Key", key).send({ packageId: pkg.id }).expect(200);

    expect(retry.headers["idempotent-replayed"]).toBe("true");
    expect(retry.body.topup.id).toBe(first.body.topup.id);
    expect(await prisma.topup.count()).toBe(1);
  });

  it("creates exactly one top-up when the same request races itself", async () => {
    const user = await registerUser();
    const pkg = await createCoinPackage();
    const key = idempotencyKey();

    const responses = await Promise.all(
      Array.from({ length: 5 }, () => user.agent.post("/api/topups").set("Idempotency-Key", key).send({ packageId: pkg.id })),
    );

    expect(new Set(responses.map((response) => response.body.topup.id)).size).toBe(1);
    expect(await prisma.topup.count()).toBe(1);
  });

  it("rejects reusing a key for a different package", async () => {
    const user = await registerUser();
    const [first, second] = [await createCoinPackage(), await createCoinPackage()];
    const key = idempotencyKey();

    await user.agent.post("/api/topups").set("Idempotency-Key", key).send({ packageId: first.id }).expect(201);
    const response = await user.agent.post("/api/topups").set("Idempotency-Key", key).send({ packageId: second.id }).expect(422);

    expect(response.body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
  });

  it("keeps historical top-ups unchanged when a package is repriced", async () => {
    const user = await registerUser();
    const pkg = await createCoinPackage({ baseCoins: 100, priceMinor: 9_900 });
    const topup = await startTopup(user, pkg.id);

    await prisma.coinPackage.update({ where: { id: pkg.id }, data: { baseCoins: 50, priceMinor: 19_900 } });

    const response = await user.agent.get(`/api/topups/${topup.id}`).expect(200);
    expect(response.body.topup).toMatchObject({ coinsTotal: 100, priceMinor: 9_900 });
  });
});

describe("FR-4 settling payments", () => {
  it("credits the wallet once on a successful payment and records a ledger entry", async () => {
    const user = await registerUser();
    const pkg = await createCoinPackage({ baseCoins: 550, bonusCoins: 50 });
    const topup = await startTopup(user, pkg.id);

    const response = await user.agent
      .post(`/api/topups/${topup.id}/simulate-payment`)
      .send({ outcome: "success" })
      .expect(200);

    expect(response.body.outcome).toBe("CREDITED");
    expect(response.body.topup.paymentStatus).toBe("SUCCEEDED");
    expect(response.body.wallet.balance).toBe(600);

    const ledger = await prisma.walletTransaction.findMany();
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ type: "TOPUP_CREDIT", amount: 600, balanceAfter: 600, topupId: topup.id });
  });

  it("does not credit coins when the payment fails, and keeps it out of the ledger", async () => {
    const user = await registerUser();
    const pkg = await createCoinPackage();
    const topup = await startTopup(user, pkg.id);

    const response = await user.agent
      .post(`/api/topups/${topup.id}/simulate-payment`)
      .send({ outcome: "failure" })
      .expect(200);

    expect(response.body.outcome).toBe("MARKED_FAILED");
    expect(response.body.topup).toMatchObject({ paymentStatus: "FAILED", creditedAt: null });
    expect(await getBalance(user.id)).toBe(0);
    expect(await prisma.walletTransaction.count()).toBe(0);
  });

  it("credits once when the provider redelivers the same success event", async () => {
    const app = newApp();
    const user = await registerUser(app);
    const pkg = await createCoinPackage({ baseCoins: 100 });
    const topup = await startTopup(user, pkg.id);
    const event = successEventFor(topup);

    const first = await sendWebhook(app, event).expect(200);
    const second = await sendWebhook(app, event).expect(200);

    expect(first.body.outcome).toBe("CREDITED");
    expect(second.body.outcome).toBe("DUPLICATE_EVENT");
    expect(await getBalance(user.id)).toBe(100);
    expect(await prisma.walletTransaction.count()).toBe(1);
  });

  it("credits once when two different success events arrive for the same payment", async () => {
    const app = newApp();
    const user = await registerUser(app);
    const pkg = await createCoinPackage({ baseCoins: 100 });
    const topup = await startTopup(user, pkg.id);

    await sendWebhook(app, successEventFor(topup)).expect(200);
    const second = await sendWebhook(app, successEventFor(topup)).expect(200);

    expect(second.body.outcome).toBe("ALREADY_FINALIZED");
    expect(await getBalance(user.id)).toBe(100);
  });

  it("credits once when the same success event is delivered concurrently", async () => {
    const app = newApp();
    const user = await registerUser(app);
    const pkg = await createCoinPackage({ baseCoins: 100 });
    const topup = await startTopup(user, pkg.id);
    const event = successEventFor(topup);

    const responses = await Promise.all(Array.from({ length: 8 }, () => sendWebhook(app, event)));

    expect(responses.every((response) => response.status === 200)).toBe(true);
    expect(responses.filter((response) => response.body.outcome === "CREDITED")).toHaveLength(1);
    expect(await getBalance(user.id)).toBe(100);
    expect(await prisma.walletTransaction.count()).toBe(1);
  });

  it("ignores a late failure event after the payment already succeeded", async () => {
    const app = newApp();
    const user = await registerUser(app);
    const pkg = await createCoinPackage({ baseCoins: 100 });
    const topup = await startTopup(user, pkg.id);

    await sendWebhook(app, successEventFor(topup)).expect(200);
    await sendWebhook(app, eventFor(topup, "failure")).expect(200);

    const stored = await prisma.topup.findUniqueOrThrow({ where: { id: topup.id } });
    expect(stored.paymentStatus).toBe("SUCCEEDED");
    expect(await getBalance(user.id)).toBe(100);
  });

  it("rejects webhooks with a missing or invalid signature", async () => {
    const app = newApp();
    const user = await registerUser(app);
    const topup = await startTopup(user, (await createCoinPackage()).id);
    const event = successEventFor(topup);

    const forged = await sendWebhook(app, event, "sha256=deadbeef").expect(401);
    expect(forged.body.error.code).toBe("INVALID_SIGNATURE");

    await supertest(app)
      .post("/api/webhooks/mock-payments")
      .set("Content-Type", "application/json")
      .send(JSON.stringify(event))
      .expect(401);

    expect(await getBalance(user.id)).toBe(0);
  });

  it("rejects an event whose amount does not match the top-up", async () => {
    const app = newApp();
    const user = await registerUser(app);
    const topup = await startTopup(user, (await createCoinPackage({ priceMinor: 99_900 })).id);
    const underpaid = eventFor(topup, "success", 100);

    const response = await sendWebhook(app, underpaid).expect(422);

    expect(response.body.error.code).toBe("PAYMENT_MISMATCH");
    expect(await getBalance(user.id)).toBe(0);
    expect((await prisma.topup.findUniqueOrThrow({ where: { id: topup.id } })).paymentStatus).toBe("PENDING");
  });

  it("returns 404 for an event about an unknown payment", async () => {
    const event = buildPaymentEvent({ paymentRef: "mockpay_unknown", amountMinor: 100, currency: "INR", outcome: "success" });
    const response = await sendWebhook(newApp(), event).expect(404);
    expect(response.body.error.code).toBe("UNKNOWN_PAYMENT");
  });

  it("does not expose the payment simulation endpoint when it is disabled", async () => {
    const app = newApp({ enablePaymentSimulation: false });
    const user = await registerUser(app);
    const topup = await startTopup(user, (await createCoinPackage()).id);

    await user.agent.post(`/api/topups/${topup.id}/simulate-payment`).send({ outcome: "success" }).expect(404);
    expect((await user.agent.get("/api/config").expect(200)).body.paymentSimulationEnabled).toBe(false);
    expect(await getBalance(user.id)).toBe(0);
  });

  it("does not let a user settle someone else's top-up", async () => {
    const app = newApp();
    const owner = await registerUser(app);
    const attacker = await registerUser(app);
    const topup = await startTopup(owner, (await createCoinPackage()).id);

    await attacker.agent.get(`/api/topups/${topup.id}`).expect(404);
    await attacker.agent.post(`/api/topups/${topup.id}/simulate-payment`).send({ outcome: "success" }).expect(404);

    expect(await getBalance(owner.id)).toBe(0);
    expect(await findUnreconciledWallets()).toEqual([]);
  });
});
