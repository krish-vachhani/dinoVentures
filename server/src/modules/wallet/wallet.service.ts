import type { LedgerEntryType, WalletTransaction } from "../../generated/prisma/client.js";
import { pageQueryArgs, toPage, type Page, type PageRequest } from "../../lib/http.js";
import { prisma } from "../../lib/prisma.js";

export interface WalletView {
  balance: number;
  updatedAt: Date;
}

export interface WalletTransactionView {
  id: string;
  type: LedgerEntryType;
  /** Signed: positive for credits, negative for debits. */
  amount: number;
  balanceAfter: number;
  description: string;
  topupId: string | null;
  orderId: string | null;
  createdAt: Date;
}

export async function getWallet(userId: string): Promise<WalletView> {
  const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId } });
  return { balance: wallet.balance, updatedAt: wallet.updatedAt };
}

export async function listWalletTransactions(userId: string, page: PageRequest): Promise<Page<WalletTransactionView>> {
  const rows = await prisma.walletTransaction.findMany({
    where: { wallet: { userId } },
    ...pageQueryArgs(page),
  });
  return toPage(rows, page, toWalletTransactionView);
}

function toWalletTransactionView(entry: WalletTransaction): WalletTransactionView {
  return {
    id: entry.id,
    type: entry.type,
    amount: entry.amount,
    balanceAfter: entry.balanceAfter,
    description: entry.description,
    topupId: entry.topupId,
    orderId: entry.orderId,
    createdAt: entry.createdAt,
  };
}
