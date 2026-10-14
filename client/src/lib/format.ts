import type { ProductCategory } from "../api/types";

const coinFormatter = new Intl.NumberFormat("en-IN");

export function formatCoins(amount: number): string {
  return coinFormatter.format(amount);
}

/** Formats a signed ledger amount, e.g. "+600" or "−250". */
export function formatSignedCoins(amount: number): string {
  if (amount > 0) return `+${formatCoins(amount)}`;
  if (amount < 0) return `−${formatCoins(Math.abs(amount))}`;
  return "0";
}

/** Real-money prices are stored in minor units (paise), never as floats. */
export function formatMoney(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: amountMinor % 100 === 0 ? 0 : 2,
  }).format(amountMinor / 100);
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(iso));
}

export const categoryLabels: Record<ProductCategory, string> = {
  SKIN: "Skin",
  EMOTE: "Emote",
  BATTLE_PASS: "Battle Pass",
};

/** A fresh key per user intent. Retries of the same intent must reuse it. */
export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}
