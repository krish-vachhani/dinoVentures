import type { PaymentStatus, Topup } from "../../generated/prisma/client.js";
import { AppError } from "../../lib/errors.js";
import { pageQueryArgs, toPage, type Page, type PageRequest } from "../../lib/http.js";
import { isUniqueViolation, prisma } from "../../lib/prisma.js";
import { buildPaymentEvent, createPayment } from "../payments/mockPaymentProvider.js";
import { handlePaymentEvent, type PaymentEventOutcome } from "../payments/paymentEvents.service.js";

export interface TopupView {
  id: string;
  packageId: string;
  packageName: string;
  coinsBase: number;
  coinsBonus: number;
  coinsTotal: number;
  priceMinor: number;
  currency: string;
  paymentStatus: PaymentStatus;
  paymentRef: string;
  failureReason: string | null;
  creditedAt: Date | null;
  createdAt: Date;
}

export interface CreateTopupResult {
  topup: TopupView;
  /** True when this response replays an earlier request with the same idempotency key. */
  replayed: boolean;
}

/**
 * Starts a coin purchase: snapshots the package's coin grant and price, and
 * opens a payment with the provider. No coins move here. They are credited
 * only when the provider confirms the payment (see handlePaymentEvent).
 */
export async function createTopup(input: {
  userId: string;
  packageId: string;
  idempotencyKey: string;
}): Promise<CreateTopupResult> {
  const previous = await findTopupByIdempotencyKey(input);
  if (previous) return previous;

  const pkg = await prisma.coinPackage.findUnique({ where: { id: input.packageId } });
  if (!pkg || !pkg.active) {
    throw AppError.unprocessable("PACKAGE_UNAVAILABLE", "This coin package is not available");
  }

  const payment = createPayment();

  try {
    const topup = await prisma.topup.create({
      data: {
        userId: input.userId,
        packageId: pkg.id,
        idempotencyKey: input.idempotencyKey,
        packageName: pkg.name,
        coinsBase: pkg.baseCoins,
        coinsBonus: pkg.bonusCoins,
        coinsTotal: pkg.baseCoins + pkg.bonusCoins,
        priceMinor: pkg.priceMinor,
        currency: pkg.currency,
        paymentRef: payment.paymentRef,
      },
    });
    return { topup: toTopupView(topup), replayed: false };
  } catch (error) {
    // A concurrent request with the same key won the race. Return its result.
    if (isUniqueViolation(error)) {
      const winner = await findTopupByIdempotencyKey(input);
      if (winner) return winner;
    }
    throw error;
  }
}

export async function getTopup(userId: string, topupId: string): Promise<TopupView> {
  // Scoping by userId means another user's top-up is indistinguishable from a missing one.
  const topup = await prisma.topup.findFirst({ where: { id: topupId, userId } });
  if (!topup) throw AppError.notFound("Top-up not found");
  return toTopupView(topup);
}

export async function listTopups(userId: string, page: PageRequest): Promise<Page<TopupView>> {
  const rows = await prisma.topup.findMany({ where: { userId }, ...pageQueryArgs(page) });
  return toPage(rows, page, toTopupView);
}

/**
 * Asks the mock provider to settle a payment (only mounted when
 * MOCK_PAYMENT_SIMULATION is on). The event
 * is built from the server-side top-up snapshot and goes through exactly the
 * same handler as a real webhook, so the client cannot pick the amount.
 */
export async function simulatePayment(input: {
  userId: string;
  topupId: string;
  outcome: "success" | "failure";
}): Promise<{ topup: TopupView; outcome: PaymentEventOutcome }> {
  const topup = await getTopup(input.userId, input.topupId);
  const event = buildPaymentEvent({
    paymentRef: topup.paymentRef,
    amountMinor: topup.priceMinor,
    currency: topup.currency,
    outcome: input.outcome,
  });

  const result = await handlePaymentEvent(event);
  return { topup: await getTopup(input.userId, input.topupId), outcome: result.outcome };
}

async function findTopupByIdempotencyKey(input: {
  userId: string;
  packageId: string;
  idempotencyKey: string;
}): Promise<CreateTopupResult | null> {
  const existing = await prisma.topup.findUnique({
    where: { userId_idempotencyKey: { userId: input.userId, idempotencyKey: input.idempotencyKey } },
  });
  if (!existing) return null;

  if (existing.packageId !== input.packageId) {
    throw AppError.unprocessable(
      "IDEMPOTENCY_KEY_REUSED",
      "This Idempotency-Key was already used for a different request",
    );
  }
  return { topup: toTopupView(existing), replayed: true };
}

function toTopupView(topup: Topup): TopupView {
  return {
    id: topup.id,
    packageId: topup.packageId,
    packageName: topup.packageName,
    coinsBase: topup.coinsBase,
    coinsBonus: topup.coinsBonus,
    coinsTotal: topup.coinsTotal,
    priceMinor: topup.priceMinor,
    currency: topup.currency,
    paymentStatus: topup.paymentStatus,
    paymentRef: topup.paymentRef,
    failureReason: topup.failureReason,
    creditedAt: topup.creditedAt,
    createdAt: topup.createdAt,
  };
}
