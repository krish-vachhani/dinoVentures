import { prisma } from "../../lib/prisma.js";
import { toProductView, type ProductView } from "../catalog/catalog.service.js";

export interface InventoryItemView {
  id: string;
  product: ProductView;
  /** The order that granted ownership. */
  orderId: string;
  grantedAt: Date;
  validFrom: Date;
  /** null for permanent items. Seasonal items expire at the end of their season. */
  validUntil: Date | null;
  isActive: boolean;
}

/** Everything the user currently owns, newest first. */
export async function listInventory(userId: string, now = new Date()): Promise<InventoryItemView[]> {
  const entitlements = await prisma.entitlement.findMany({
    where: { userId },
    include: { product: true },
    orderBy: [{ grantedAt: "desc" }, { id: "desc" }],
  });

  return entitlements.map((entitlement) => ({
    id: entitlement.id,
    product: toProductView(entitlement.product),
    orderId: entitlement.orderId,
    grantedAt: entitlement.grantedAt,
    validFrom: entitlement.validFrom,
    validUntil: entitlement.validUntil,
    isActive: entitlement.validUntil === null || entitlement.validUntil > now,
  }));
}
