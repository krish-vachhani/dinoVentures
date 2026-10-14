import { Router } from "express";
import { z } from "zod";
import { idParamSchema, paginationQuerySchema, parseOrThrow, requireIdempotencyKey } from "../../lib/http.js";
import { authenticate, currentUser } from "../../middleware/authenticate.js";
import { getOrder, listOrders, purchaseProduct } from "./orders.service.js";

export const ordersRouter = Router();

ordersRouter.use(authenticate);

// Only the product id is accepted. Price and quantity are never taken from the client.
const createOrderSchema = z.strictObject({ productId: z.uuid() });

ordersRouter.post("/", async (req, res) => {
  const idempotencyKey = requireIdempotencyKey(req);
  const { productId } = parseOrThrow(createOrderSchema, req.body);

  const result = await purchaseProduct({ userId: currentUser(req).id, productId, idempotencyKey });

  res
    .status(result.replayed ? 200 : 201)
    .set("Idempotent-Replayed", String(result.replayed))
    .json({ order: result.order, wallet: { balance: result.balance } });
});

ordersRouter.get("/", async (req, res) => {
  const page = parseOrThrow(paginationQuerySchema, req.query);
  res.json(await listOrders(currentUser(req).id, page));
});

ordersRouter.get("/:id", async (req, res) => {
  const { id } = parseOrThrow(idParamSchema, req.params);
  res.json({ order: await getOrder(currentUser(req).id, id) });
});
