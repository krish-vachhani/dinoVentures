-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ProductCategory" AS ENUM ('SKIN', 'EMOTE', 'BATTLE_PASS');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('TOPUP_CREDIT', 'PURCHASE_DEBIT');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('COMPLETED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_transactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "wallet_id" UUID NOT NULL,
    "type" "LedgerEntryType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "balance_after" INTEGER NOT NULL,
    "topup_id" UUID,
    "order_id" UUID,
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coin_packages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "base_coins" INTEGER NOT NULL,
    "bonus_coins" INTEGER NOT NULL DEFAULT 0,
    "price_minor" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coin_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "package_id" UUID NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "package_name" TEXT NOT NULL,
    "coins_base" INTEGER NOT NULL,
    "coins_bonus" INTEGER NOT NULL,
    "coins_total" INTEGER NOT NULL,
    "price_minor" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "payment_status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "payment_ref" TEXT NOT NULL,
    "failure_reason" TEXT,
    "credited_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "topups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "provider_event_id" TEXT NOT NULL,
    "topup_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "ProductCategory" NOT NULL,
    "image_url" TEXT NOT NULL,
    "price_coins" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "season_code" TEXT,
    "season_starts_at" TIMESTAMPTZ(6),
    "season_ends_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit_price_coins" INTEGER NOT NULL,
    "total_coins" INTEGER NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'COMPLETED',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entitlements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "season_code" TEXT,
    "valid_from" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_until" TIMESTAMPTZ(6),
    "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entitlements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_user_id_key" ON "wallets"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_transactions_topup_id_key" ON "wallet_transactions"("topup_id");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_transactions_order_id_key" ON "wallet_transactions"("order_id");

-- CreateIndex
CREATE INDEX "wallet_transactions_wallet_id_created_at_id_idx" ON "wallet_transactions"("wallet_id", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "coin_packages_code_key" ON "coin_packages"("code");

-- CreateIndex
CREATE UNIQUE INDEX "topups_payment_ref_key" ON "topups"("payment_ref");

-- CreateIndex
CREATE INDEX "topups_user_id_created_at_id_idx" ON "topups"("user_id", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "topups_user_id_idempotency_key_key" ON "topups"("user_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "payment_events_provider_event_id_key" ON "payment_events"("provider_event_id");

-- CreateIndex
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");

-- CreateIndex
CREATE INDEX "products_category_active_idx" ON "products"("category", "active");

-- CreateIndex
CREATE INDEX "orders_user_id_created_at_id_idx" ON "orders"("user_id", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "orders_user_id_idempotency_key_key" ON "orders"("user_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "entitlements_order_id_key" ON "entitlements"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "entitlements_user_id_product_id_key" ON "entitlements"("user_id", "product_id");

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_topup_id_fkey" FOREIGN KEY ("topup_id") REFERENCES "topups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topups" ADD CONSTRAINT "topups_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topups" ADD CONSTRAINT "topups_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "coin_packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_topup_id_fkey" FOREIGN KEY ("topup_id") REFERENCES "topups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-written invariants Prisma's schema language cannot express.
-- ---------------------------------------------------------------------------

ALTER TABLE "users"
  ADD CONSTRAINT "users_email_lowercase" CHECK (email = lower(email));

ALTER TABLE "wallets"
  ADD CONSTRAINT "wallets_balance_non_negative" CHECK (balance >= 0);

ALTER TABLE "coin_packages"
  ADD CONSTRAINT "coin_packages_base_coins_positive" CHECK (base_coins > 0),
  ADD CONSTRAINT "coin_packages_bonus_coins_non_negative" CHECK (bonus_coins >= 0),
  ADD CONSTRAINT "coin_packages_price_positive" CHECK (price_minor > 0),
  ADD CONSTRAINT "coin_packages_currency_format" CHECK (currency ~ '^[A-Z]{3}$');

ALTER TABLE "topups"
  ADD CONSTRAINT "topups_coins_consistent" CHECK (
    coins_base > 0 AND coins_bonus >= 0 AND coins_total = coins_base + coins_bonus
  ),
  ADD CONSTRAINT "topups_price_positive" CHECK (price_minor > 0),
  -- Coins may only be credited for a successful payment.
  ADD CONSTRAINT "topups_credit_requires_success" CHECK (
    credited_at IS NULL OR payment_status = 'SUCCEEDED'
  );

ALTER TABLE "products"
  ADD CONSTRAINT "products_price_positive" CHECK (price_coins > 0),
  ADD CONSTRAINT "products_battle_pass_has_season" CHECK (
    category <> 'BATTLE_PASS'
    OR (season_code IS NOT NULL AND season_starts_at IS NOT NULL AND season_ends_at IS NOT NULL
        AND season_ends_at > season_starts_at)
  );

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_quantity_positive" CHECK (quantity > 0),
  ADD CONSTRAINT "orders_total_consistent" CHECK (
    unit_price_coins > 0 AND total_coins = unit_price_coins * quantity
  );

ALTER TABLE "wallet_transactions"
  ADD CONSTRAINT "wallet_transactions_balance_after_non_negative" CHECK (balance_after >= 0),
  -- Each entry type has the right sign and exactly one source reference.
  ADD CONSTRAINT "wallet_transactions_shape" CHECK (
    (type = 'TOPUP_CREDIT' AND amount > 0 AND topup_id IS NOT NULL AND order_id IS NULL)
    OR
    (type = 'PURCHASE_DEBIT' AND amount < 0 AND order_id IS NOT NULL AND topup_id IS NULL)
  );

-- The ledger is append-only. Corrections must be new compensating entries.
CREATE FUNCTION "reject_ledger_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'wallet_transactions is append-only (% rejected)', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "wallet_transactions_append_only"
  BEFORE UPDATE OR DELETE ON "wallet_transactions"
  FOR EACH ROW EXECUTE FUNCTION "reject_ledger_mutation"();

-- Balance must be reproducible from the ledger. Any row here is a bug.
CREATE VIEW "wallet_reconciliation" AS
SELECT w.id AS wallet_id,
       w.user_id,
       w.balance AS cached_balance,
       COALESCE(SUM(t.amount), 0)::int AS ledger_balance
FROM "wallets" w
LEFT JOIN "wallet_transactions" t ON t.wallet_id = w.id
GROUP BY w.id
HAVING w.balance <> COALESCE(SUM(t.amount), 0);
