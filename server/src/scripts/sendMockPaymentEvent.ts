/**
 * Plays the role of the payment provider: sends a signed webhook event for a
 * pending payment, exactly as a real gateway would after the customer pays.
 *
 * This is how coins are credited when the in-app simulation is disabled
 * (e.g. NODE_ENV=production):
 *
 *   npm run mock:pay -- <paymentRef> [success|failure]
 *   node dist/scripts/sendMockPaymentEvent.js <paymentRef> [success|failure]   # inside the container
 */
import { config } from "../config.js";
import { prisma } from "../lib/prisma.js";
import { buildPaymentEvent, signPayload, SIGNATURE_HEADER } from "../modules/payments/mockPaymentProvider.js";

async function main() {
  const [paymentRef, outcomeArg = "success"] = process.argv.slice(2);
  if (!paymentRef || (outcomeArg !== "success" && outcomeArg !== "failure")) {
    console.error("Usage: sendMockPaymentEvent <paymentRef> [success|failure]");
    process.exitCode = 1;
    return;
  }

  // The provider knows what it charged. We read it from the top-up record.
  const topup = await prisma.topup.findUnique({ where: { paymentRef } });
  if (!topup) {
    console.error(`No top-up found for payment reference ${paymentRef}`);
    process.exitCode = 1;
    return;
  }

  const event = buildPaymentEvent({
    paymentRef,
    amountMinor: topup.priceMinor,
    currency: topup.currency,
    outcome: outcomeArg,
  });
  const body = JSON.stringify(event);
  const apiUrl = process.env.API_URL ?? `http://localhost:${config.port}`;

  const response = await fetch(`${apiUrl}/api/webhooks/mock-payments`, {
    method: "POST",
    headers: { "Content-Type": "application/json", [SIGNATURE_HEADER]: signPayload(body) },
    body,
  });

  console.error(`${response.status} ${await response.text()}`);
  if (!response.ok) process.exitCode = 1;
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
