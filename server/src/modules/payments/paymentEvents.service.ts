import type { Topup } from "../../generated/prisma/client.js";
import { AppError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { runInTransaction, type TransactionClient } from "../../lib/prisma.js";
import type { PaymentEvent } from "./mockPaymentProvider.js";

export type PaymentEventOutcome =
  | "CREDITED" // payment succeeded and the wallet was credited
  | "MARKED_FAILED" // payment failed, nothing credited
  | "DUPLICATE_EVENT" // this exact event was already processed
  | "ALREADY_FINALIZED"; // a different event already settled this top-up

export interface PaymentEventResult {
  outcome: PaymentEventOutcome;
  topupId: string;
}

/**
 * Applies a verified payment-provider event to its top-up.
 *
 * Providers deliver at least once, so this must be safe to run any number of
 * times. Three independent guards make sure a payment credits coins once:
 *   1. The top-up row is locked (`FOR UPDATE`), so events for the same
 *      payment are processed one at a time.
 *   2. Events are recorded by provider event id. A redelivered event is a no-op.
 *   3. Coins are credited only on the PENDING -> SUCCEEDED transition, and the
 *      ledger's unique `topup_id` rejects a second credit at the database level.
 */
export async function handlePaymentEvent(event: PaymentEvent): Promise<PaymentEventResult> {
  return runInTransaction(async (tx) => {
    const topup = await lockTopupByPaymentRef(tx, event.data.paymentRef);
    if (!topup) {
      throw AppError.notFound("No top-up exists for this payment reference", "UNKNOWN_PAYMENT");
    }

    const isNewEvent = await recordEvent(tx, event, topup.id);
    if (!isNewEvent) return { outcome: "DUPLICATE_EVENT", topupId: topup.id };

    assertEventMatchesTopup(event, topup);

    if (topup.paymentStatus !== "PENDING") {
      logger.warn({ topupId: topup.id, eventId: event.id, status: topup.paymentStatus }, "Event for settled top-up ignored");
      return { outcome: "ALREADY_FINALIZED", topupId: topup.id };
    }

    if (event.type === "payment.failed") {
      await tx.topup.update({
        where: { id: topup.id },
        data: { paymentStatus: "FAILED", failureReason: event.data.failureReason ?? "Payment failed" },
      });
      return { outcome: "MARKED_FAILED", topupId: topup.id };
    }

    await creditWalletForTopup(tx, topup);
    return { outcome: "CREDITED", topupId: topup.id };
  });
}

async function lockTopupByPaymentRef(tx: TransactionClient, paymentRef: string): Promise<Topup | null> {
  const locked = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM topups WHERE payment_ref = ${paymentRef} FOR UPDATE
  `;
  const topupId = locked[0]?.id;
  return topupId ? tx.topup.findUniqueOrThrow({ where: { id: topupId } }) : null;
}

/** Returns false when the provider already delivered this event. */
async function recordEvent(tx: TransactionClient, event: PaymentEvent, topupId: string): Promise<boolean> {
  const { count } = await tx.paymentEvent.createMany({
    data: [{ providerEventId: event.id, topupId, type: event.type, payload: event }],
    skipDuplicates: true, // ON CONFLICT DO NOTHING, so the transaction is not aborted
  });
  return count === 1;
}

/** The provider must confirm the exact amount we asked for, in the right currency. */
function assertEventMatchesTopup(event: PaymentEvent, topup: Topup) {
  if (event.data.amountMinor !== topup.priceMinor || event.data.currency !== topup.currency) {
    logger.error(
      { topupId: topup.id, eventId: event.id, expected: [topup.priceMinor, topup.currency], received: event.data },
      "Payment event amount does not match top-up",
    );
    throw AppError.unprocessable("PAYMENT_MISMATCH", "Payment amount or currency does not match the top-up");
  }
}

async function creditWalletForTopup(tx: TransactionClient, topup: Topup) {
  await tx.topup.update({
    where: { id: topup.id },
    data: { paymentStatus: "SUCCEEDED", creditedAt: new Date() },
  });

  const wallet = await tx.wallet.update({
    where: { userId: topup.userId },
    data: { balance: { increment: topup.coinsTotal } },
  });

  await tx.walletTransaction.create({
    data: {
      walletId: wallet.id,
      type: "TOPUP_CREDIT",
      amount: topup.coinsTotal,
      balanceAfter: wallet.balance,
      topupId: topup.id,
      description: `Top-up: ${topup.packageName} (${topup.coinsTotal} coins)`,
    },
  });
}
