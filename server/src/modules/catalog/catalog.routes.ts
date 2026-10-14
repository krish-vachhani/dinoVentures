import { Router } from "express";
import { z } from "zod";
import { ProductCategory } from "../../generated/prisma/enums.js";
import { idParamSchema, parseOrThrow } from "../../lib/http.js";
import { optionalAuthenticate } from "../../middleware/authenticate.js";
import { getProduct, listCoinPackages, listProducts } from "./catalog.service.js";

export const catalogRouter = Router();

const productListQuerySchema = z.object({
  category: z.enum(ProductCategory).optional(),
});

// The catalog is public. A signed-in user also sees which products they own.
catalogRouter.get("/products", optionalAuthenticate, async (req, res) => {
  const { category } = parseOrThrow(productListQuerySchema, req.query);
  res.json({ items: await listProducts({ category, userId: req.user?.id }) });
});

catalogRouter.get("/products/:id", optionalAuthenticate, async (req, res) => {
  const { id } = parseOrThrow(idParamSchema, req.params);
  res.json({ product: await getProduct(id, req.user?.id) });
});

catalogRouter.get("/coin-packages", async (_req, res) => {
  res.json({ items: await listCoinPackages() });
});
