import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { config } from "../../config.js";

/**
 * Stand-in for a real payment gateway (Razorpay, Stripe, ...).
 *
 * The shape mirrors a real integration: we create a payment and get back a
 * provider reference. The provider later tells us the outcome through a
 * signed webhook event. Coins are only ever credited from a verified event,
 * never from anything the client says about the payment.
 */

export const SIGNATURE_HEADER = "X-MockPay-Signature";

export const paymentEventSchema = z.object({
  id: z.string().min(1).max(128),
  type: z.enum(["payment.succeeded", "payment.failed"]),
  data: z.object({
    paymentRef: z.string().min(1).max(128),
    amountMinor: z.number().int().positive(),
    currency: z.string().length(3),
    failureReason: z.string().max(200).optional(),
  }),
});

export type PaymentEvent = z.infer<typeof paymentEventSchema>;

export interface CreatedPayment {
  paymentRef: string;
}

export function createPayment(): CreatedPayment {
  return { paymentRef: `mockpay_${randomUUID()}` };
}

export function signPayload(rawBody: string | Buffer): string {
  const digest = createHmac("sha256", config.payments.webhookSecret).update(rawBody).digest("hex");
  return `sha256=${digest}`;
}

/** Constant-time comparison so the signature cannot be guessed byte by byte. */
export function isValidSignature(rawBody: Buffer, signature: string | undefined): boolean {
  if (!signature) return false;
  const expected = Buffer.from(signPayload(rawBody));
  const received = Buffer.from(signature);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

/** Builds the event the provider would send for a payment outcome. */
export function buildPaymentEvent(input: {
  paymentRef: string;
  amountMinor: number;
  currency: string;
  outcome: "success" | "failure";
}): PaymentEvent {
  return {
    id: `evt_${randomUUID()}`,
    type: input.outcome === "success" ? "payment.succeeded" : "payment.failed",
    data: {
      paymentRef: input.paymentRef,
      amountMinor: input.amountMinor,
      currency: input.currency,
      ...(input.outcome === "failure" && { failureReason: "Card declined (simulated)" }),
    },
  };
}
