import type { CoinPackage, Product, ProductCategory } from "../../generated/prisma/client.js";
import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";

export interface ProductView {
  id: string;
  sku: string;
  name: string;
  description: string;
  category: ProductCategory;
  imageUrl: string;
  priceCoins: number;
  season: { code: string; startsAt: Date | null; endsAt: Date | null } | null;
  /** Present only for authenticated requests. */
  owned?: boolean;
}

export interface CoinPackageView {
  id: string;
  code: string;
  name: string;
  baseCoins: number;
  bonusCoins: number;
  totalCoins: number;
  priceMinor: number;
  currency: string;
}

export function toProductView(product: Product): ProductView {
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    description: product.description,
    category: product.category,
    imageUrl: product.imageUrl,
    priceCoins: product.priceCoins,
    season: product.seasonCode
      ? { code: product.seasonCode, startsAt: product.seasonStartsAt, endsAt: product.seasonEndsAt }
      : null,
  };
}

export function toCoinPackageView(pkg: CoinPackage): CoinPackageView {
  return {
    id: pkg.id,
    code: pkg.code,
    name: pkg.name,
    baseCoins: pkg.baseCoins,
    bonusCoins: pkg.bonusCoins,
    totalCoins: pkg.baseCoins + pkg.bonusCoins,
    priceMinor: pkg.priceMinor,
    currency: pkg.currency,
  };
}

/** Active products, optionally filtered by category, flagged with ownership for a signed-in user. */
export async function listProducts(options: { category?: ProductCategory; userId?: string }): Promise<ProductView[]> {
  const products = await prisma.product.findMany({
    where: { active: true, ...(options.category && { category: options.category }) },
    orderBy: [{ category: "asc" }, { priceCoins: "asc" }, { name: "asc" }],
  });

  if (!options.userId) return products.map(toProductView);

  const ownedProductIds = await findOwnedProductIds(options.userId);
  return products.map((product) => ({ ...toProductView(product), owned: ownedProductIds.has(product.id) }));
}

export async function getProduct(productId: string, userId?: string): Promise<ProductView> {
  const product = await prisma.product.findFirst({ where: { id: productId, active: true } });
  if (!product) throw AppError.notFound("Product not found");

  if (!userId) return toProductView(product);

  const owned = await prisma.entitlement.findUnique({
    where: { userId_productId: { userId, productId } },
    select: { id: true },
  });
  return { ...toProductView(product), owned: owned !== null };
}

export async function listCoinPackages(): Promise<CoinPackageView[]> {
  const packages = await prisma.coinPackage.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { priceMinor: "asc" }],
  });
  return packages.map(toCoinPackageView);
}

async function findOwnedProductIds(userId: string): Promise<Set<string>> {
  const entitlements = await prisma.entitlement.findMany({ where: { userId }, select: { productId: true } });
  return new Set(entitlements.map((entitlement) => entitlement.productId));
}
