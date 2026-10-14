// Response shapes of the Coin Vault API. Dates arrive as ISO strings.

export type ProductCategory = "SKIN" | "EMOTE" | "BATTLE_PASS";
export type PaymentStatus = "PENDING" | "SUCCEEDED" | "FAILED";
export type LedgerEntryType = "TOPUP_CREDIT" | "PURCHASE_DEBIT";

export interface User {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
  balance: number;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  description: string;
  category: ProductCategory;
  imageUrl: string;
  priceCoins: number;
  season: { code: string; startsAt: string | null; endsAt: string | null } | null;
  owned?: boolean;
}

export interface CoinPackage {
  id: string;
  code: string;
  name: string;
  baseCoins: number;
  bonusCoins: number;
  totalCoins: number;
  priceMinor: number;
  currency: string;
}

export interface Topup {
  id: string;
  packageId: string;
  packageName: string;
  coinsBase: number;
  coinsBonus: number;
  coinsTotal: number;
  priceMinor: number;
  currency: string;
  paymentStatus: PaymentStatus;
  paymentRef: string;
  failureReason: string | null;
  creditedAt: string | null;
  createdAt: string;
}

export interface Order {
  id: string;
  productId: string;
  productName: string;
  productCategory: ProductCategory;
  productImageUrl: string;
  quantity: number;
  unitPriceCoins: number;
  totalCoins: number;
  status: "COMPLETED";
  createdAt: string;
}

export interface WalletTransaction {
  id: string;
  type: LedgerEntryType;
  amount: number;
  balanceAfter: number;
  description: string;
  topupId: string | null;
  orderId: string | null;
  createdAt: string;
}

export interface InventoryItem {
  id: string;
  product: Product;
  orderId: string;
  grantedAt: string;
  validFrom: string;
  validUntil: string | null;
  isActive: boolean;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}
