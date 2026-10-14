import { prisma } from "../../src/lib/prisma.js";

const TABLES = [
  "payment_events",
  "wallet_transactions",
  "entitlements",
  "orders",
  "topups",
  "wallets",
  "users",
  "products",
  "coin_packages",
];

/** Empties every table. TRUNCATE skips row-level triggers, so the append-only ledger guard does not block it. */
export async function resetDatabase() {
  await prisma.$executeRawUnsafe(`TRUNCATE ${TABLES.map((table) => `"${table}"`).join(", ")} CASCADE`);
}

/** Rows where the cached wallet balance disagrees with the ledger. Should always be empty. */
export async function findUnreconciledWallets() {
  return prisma.$queryRaw<{ wallet_id: string; cached_balance: number; ledger_balance: number }[]>`
    SELECT wallet_id, cached_balance, ledger_balance FROM wallet_reconciliation
  `;
}

export async function getBalance(userId: string): Promise<number> {
  const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId } });
  return wallet.balance;
}
