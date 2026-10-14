import { Router } from "express";
import { authenticate, currentUser } from "../../middleware/authenticate.js";
import { listInventory } from "./inventory.service.js";

export const inventoryRouter = Router();

inventoryRouter.use(authenticate);

inventoryRouter.get("/", async (req, res) => {
  res.json({ items: await listInventory(currentUser(req).id) });
});
