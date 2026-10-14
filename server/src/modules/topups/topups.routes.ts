import { Router } from "express";
import { z } from "zod";
import { idParamSchema, paginationQuerySchema, parseOrThrow, requireIdempotencyKey } from "../../lib/http.js";
import { authenticate, currentUser } from "../../middleware/authenticate.js";
import { getWallet } from "../wallet/wallet.service.js";
import { createTopup, getTopup, listTopups, simulatePayment } from "./topups.service.js";

const createTopupSchema = z.object({ packageId: z.uuid() });
const simulatePaymentSchema = z.object({ outcome: z.enum(["success", "failure"]) });

/**
 * @param options.enablePaymentSimulation mounts the endpoint that settles mock
 *   payments from the UI (MOCK_PAYMENT_SIMULATION). When it is off, payments
 *   settle only through the signed provider webhook.
 */
export function createTopupsRouter(options: { enablePaymentSimulation: boolean }) {
  const router = Router();
  router.use(authenticate);

  router.post("/", async (req, res) => {
    const idempotencyKey = requireIdempotencyKey(req);
    const { packageId } = parseOrThrow(createTopupSchema, req.body);

    const result = await createTopup({ userId: currentUser(req).id, packageId, idempotencyKey });

    res
      .status(result.replayed ? 200 : 201)
      .set("Idempotent-Replayed", String(result.replayed))
      .json({ topup: result.topup });
  });

  router.get("/", async (req, res) => {
    const page = parseOrThrow(paginationQuerySchema, req.query);
    res.json(await listTopups(currentUser(req).id, page));
  });

  router.get("/:id", async (req, res) => {
    const { id } = parseOrThrow(idParamSchema, req.params);
    res.json({ topup: await getTopup(currentUser(req).id, id) });
  });

  if (options.enablePaymentSimulation) {
    router.post("/:id/simulate-payment", async (req, res) => {
      const { id } = parseOrThrow(idParamSchema, req.params);
      const { outcome } = parseOrThrow(simulatePaymentSchema, req.body);
      const userId = currentUser(req).id;

      const result = await simulatePayment({ userId, topupId: id, outcome });
      res.json({ ...result, wallet: await getWallet(userId) });
    });
  }

  return router;
}
