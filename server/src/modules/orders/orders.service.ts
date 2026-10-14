import type { Order, OrderStatus, Product, ProductCategory } from "../../generated/prisma/client.js";
import { AppError } from "../../lib/errors.js";
import { pageQueryArgs, toPage, type Page, type PageRequest } from "../../lib/http.js";
import { isUniqueViolation, prisma, runInTransaction, type TransactionClient } from "../../lib/prisma.js";

export interface OrderView {
  id: string;
  productId: string;
  productName: string;
  productCategory: ProductCategory;
  productImageUrl: string;
  quantity: number;
  unitPriceCoins: number;
  totalCoins: number;
  status: OrderStatus;
  createdAt: Date;
}

export interface PurchaseResult {
  order: OrderView;
  balance: number;
  /** True when this response replays an earlier request with the same idempotency key. */
  replayed: boolean;
}

interface PurchaseInput {
  userId: string;
  productId: string;
  idempotencyKey: string;
}

type OrderWithProduct = Order & { product: Pick<Product, "category" | "imageUrl"> };

const withProductSummary = { product: { select: { category: true, imageUrl: true } } } as const;

/**
 * Buys one product with Gold Coins.
 *
 * The debit, the order, the ledger entry and the ownership grant are written
 * in one transaction: they all commit or none do. Safety under retries and
 * concurrency comes from the database rather than from in-process checks:
 *   - `UPDATE wallets SET balance = balance - price WHERE balance >= price`
 *     is atomic, so concurrent purchases can never overdraw the wallet.
 *   - UNIQUE(user_id, idempotency_key) on orders makes a retried request
 *     replay the original order instead of charging twice.
 *   - UNIQUE(user_id, product_id) on entitlements means a product can be owned
 *     only once, even if two different requests race to buy it.
 */
export async function purchaseProduct(input: PurchaseInput): Promise<PurchaseResult> {
  const previous = await findOrderByIdempotencyKey(input);
  if (previous) return previous;

  try {
    return await runInTransaction((tx) => executePurchase(tx, input));
  } catch (error) {
    if (isUniqueViolation(error)) return resolvePurchaseConflict(input, error);
    throw error;
  }
}

async function executePurchase(tx: TransactionClient, input: PurchaseInput): Promise<PurchaseResult> {
  const product = await loadPurchasableProduct(tx, input.productId);

  // Checked up front for a clear error. The unique constraint is the real guard.
  const alreadyOwned = await tx.entitlement.findUnique({
    where: { userId_productId: { userId: input.userId, productId: product.id } },
    select: { id: true },
  });
  if (alreadyOwned) throw alreadyOwnedError();

  const wallet = await debitWallet(tx, input.userId, product.priceCoins);

  const order = await tx.order.create({
    data: {
      userId: input.userId,
      productId: product.id,
      idempotencyKey: input.idempotencyKey,
      productName: product.name,
      quantity: 1,
      unitPriceCoins: product.priceCoins,
      totalCoins: product.priceCoins,
    },
    include: withProductSummary,
  });

  await tx.walletTransaction.create({
    data: {
      walletId: wallet.id,
      type: "PURCHASE_DEBIT",
      amount: -product.priceCoins,
      balanceAfter: wallet.balance,
      orderId: order.id,
      description: `Purchase: ${product.name}`,
    },
  });

  await tx.entitlement.create({
    data: {
      userId: input.userId,
      productId: product.id,
      orderId: order.id,
      seasonCode: product.seasonCode,
      validUntil: product.seasonEndsAt, // null for permanent items
    },
  });

  return { order: toOrderView(order), balance: wallet.balance, replayed: false };
}

/** The product's price and availability always come from the database, never from the client. */
async function loadPurchasableProduct(tx: TransactionClient, productId: string): Promise<Product> {
  const product = await tx.product.findUnique({ where: { id: productId } });

  if (!product || !product.active || product.priceCoins <= 0) {
    throw AppError.unprocessable("PRODUCT_UNAVAILABLE", "This product is not available for purchase");
  }
  if (product.seasonEndsAt && product.seasonEndsAt <= new Date()) {
    throw AppError.unprocessable("PRODUCT_UNAVAILABLE", "This season has ended");
  }
  return product;
}

/**
 * Atomically subtracts `amount` if, and only if, the balance covers it.
 * Concurrent debits queue on the wallet row lock, and each one re-checks the
 * condition against the latest committed balance.
 */
async function debitWallet(tx: TransactionClient, userId: string, amount: number) {
  const [wallet] = await tx.wallet.updateManyAndReturn({
    where: { userId, balance: { gte: amount } },
    data: { balance: { decrement: amount } },
  });

  if (!wallet) {
    const { balance } = await tx.wallet.findUniqueOrThrow({ where: { userId }, select: { balance: true } });
    throw AppError.conflict("INSUFFICIENT_FUNDS", "Not enough Gold Coins for this purchase", {
      required: amount,
      balance,
    });
  }
  return wallet;
}

/**
 * A unique constraint rejected the transaction, and everything was rolled
 * back. Work out which race we lost and answer as if we had run second.
 */
async function resolvePurchaseConflict(input: PurchaseInput, error: unknown): Promise<PurchaseResult> {
  const replay = await findOrderByIdempotencyKey(input);
  if (replay) return replay; // same request retried concurrently

  const owned = await prisma.entitlement.findUnique({
    where: { userId_productId: { userId: input.userId, productId: input.productId } },
    select: { id: true },
  });
  if (owned) throw alreadyOwnedError(); // a different request bought it first

  throw error;
}

async function findOrderByIdempotencyKey(input: PurchaseInput): Promise<PurchaseResult | null> {
  const existing = await prisma.order.findUnique({
    where: { userId_idempotencyKey: { userId: input.userId, idempotencyKey: input.idempotencyKey } },
    include: withProductSummary,
  });
  if (!existing) return null;

  if (existing.productId !== input.productId) {
    throw AppError.unprocessable(
      "IDEMPOTENCY_KEY_REUSED",
      "This Idempotency-Key was already used for a different request",
    );
  }

  const { balance } = await prisma.wallet.findUniqueOrThrow({
    where: { userId: input.userId },
    select: { balance: true },
  });
  return { order: toOrderView(existing), balance, replayed: true };
}

export async function getOrder(userId: string, orderId: string): Promise<OrderView> {
  const order = await prisma.order.findFirst({ where: { id: orderId, userId }, include: withProductSummary });
  if (!order) throw AppError.notFound("Order not found");
  return toOrderView(order);
}

export async function listOrders(userId: string, page: PageRequest): Promise<Page<OrderView>> {
  const rows = await prisma.order.findMany({
    where: { userId },
    include: withProductSummary,
    ...pageQueryArgs(page),
  });
  return toPage(rows, page, toOrderView);
}

function alreadyOwnedError() {
  return AppError.conflict("ALREADY_OWNED", "You already own this product");
}

function toOrderView(order: OrderWithProduct): OrderView {
  return {
    id: order.id,
    productId: order.productId,
    productName: order.productName, // snapshot taken at purchase time
    productCategory: order.product.category,
    productImageUrl: order.product.imageUrl,
    quantity: order.quantity,
    unitPriceCoins: order.unitPriceCoins,
    totalCoins: order.totalCoins,
    status: order.status,
    createdAt: order.createdAt,
  };
}
