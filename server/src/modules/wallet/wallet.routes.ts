import { Router } from "express";
import { paginationQuerySchema, parseOrThrow } from "../../lib/http.js";
import { authenticate, currentUser } from "../../middleware/authenticate.js";
import { getWallet, listWalletTransactions } from "./wallet.service.js";

export const walletRouter = Router();

walletRouter.use(authenticate);

walletRouter.get("/", async (req, res) => {
  res.json({ wallet: await getWallet(currentUser(req).id) });
});

walletRouter.get("/transactions", async (req, res) => {
  const page = parseOrThrow(paginationQuerySchema, req.query);
  res.json(await listWalletTransactions(currentUser(req).id, page));
});
