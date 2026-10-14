import express, { Router } from "express";
import { AppError } from "../../lib/errors.js";
import { parseOrThrow } from "../../lib/http.js";
import { isValidSignature, paymentEventSchema, SIGNATURE_HEADER } from "./mockPaymentProvider.js";
import { handlePaymentEvent } from "./paymentEvents.service.js";

export const paymentWebhookRouter = Router();

/**
 * Server-to-server webhook from the payment provider. It is authenticated by
 * an HMAC signature over the raw body, not by a user session. The raw bytes
 * are needed to verify the signature, so this route parses JSON itself.
 */
paymentWebhookRouter.post("/mock-payments", express.raw({ type: "application/json", limit: "64kb" }), async (req, res) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

  if (!isValidSignature(rawBody, req.get(SIGNATURE_HEADER))) {
    throw AppError.unauthorized("INVALID_SIGNATURE", "Webhook signature is missing or invalid");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    throw AppError.badRequest("INVALID_JSON", "Request body is not valid JSON");
  }

  const event = parseOrThrow(paymentEventSchema, payload);
  const result = await handlePaymentEvent(event);
  res.json({ received: true, ...result });
});
