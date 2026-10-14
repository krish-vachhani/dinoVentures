/**
 * Seeds the catalog: coin packages and products. Safe to run repeatedly.
 * Rows are upserted by their business key (package code / product SKU).
 *
 * Images live in the client under /public/images/products.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";
import type { ProductCategory } from "../src/generated/prisma/enums.js";

// The seed only needs the database, not the API's full config (JWT secret etc.).
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required to seed");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

const coinPackages = [
  { code: "starter", name: "Starter", baseCoins: 100, bonusCoins: 0, priceMinor: 9_900, sortOrder: 1 },
  { code: "gamer", name: "Gamer", baseCoins: 550, bonusCoins: 50, priceMinor: 49_900, sortOrder: 2 },
  { code: "ultimate", name: "Ultimate", baseCoins: 1_200, bonusCoins: 200, priceMinor: 99_900, sortOrder: 3 },
  { code: "legend", name: "Legend", baseCoins: 2_600, bonusCoins: 600, priceMinor: 199_900, sortOrder: 4 },
];

interface SeedProduct {
  sku: string;
  name: string;
  description: string;
  category: ProductCategory;
  priceCoins: number;
  season?: { code: string; startsAt: Date; endsAt: Date };
}

const SEASON_7 = { code: "S7", startsAt: new Date("2026-09-01T00:00:00Z"), endsAt: new Date("2027-12-31T23:59:59Z") };

const products: SeedProduct[] = [
  { sku: "skin-neon-ronin", name: "Neon Ronin", description: "A cyber-samurai armour set that glows in the dark.", category: "SKIN", priceCoins: 800 },
  { sku: "skin-arctic-wolf", name: "Arctic Wolf", description: "Frost-white tactical gear with a howling wolf crest.", category: "SKIN", priceCoins: 600 },
  { sku: "skin-solar-flare", name: "Solar Flare", description: "Molten-gold plating that shimmers with every step.", category: "SKIN", priceCoins: 1_200 },
  { sku: "skin-jungle-viper", name: "Jungle Viper", description: "Camouflage scales for silent movers.", category: "SKIN", priceCoins: 400 },
  { sku: "emote-victory-dance", name: "Victory Dance", description: "Celebrate a win with an over-the-top dance.", category: "EMOTE", priceCoins: 200 },
  { sku: "emote-salute", name: "Salute", description: "A crisp salute for your squad.", category: "EMOTE", priceCoins: 100 },
  { sku: "emote-mic-drop", name: "Mic Drop", description: "Drop the mic. Walk away.", category: "EMOTE", priceCoins: 300 },
  { sku: "emote-facepalm", name: "Facepalm", description: "For those moments when things go sideways.", category: "EMOTE", priceCoins: 150 },
  { sku: "bp-season-7", name: "Season 7 Battle Pass", description: "Unlock the Season 7 reward track.", category: "BATTLE_PASS", priceCoins: 950, season: SEASON_7 },
  { sku: "bp-season-7-elite", name: "Season 7 Elite Pass", description: "The Season 7 pass plus 25 tiers unlocked instantly.", category: "BATTLE_PASS", priceCoins: 2_400, season: SEASON_7 },
];

async function main() {
  for (const pkg of coinPackages) {
    const data = { ...pkg, currency: "INR", active: true };
    await prisma.coinPackage.upsert({ where: { code: pkg.code }, create: data, update: data });
  }

  for (const product of products) {
    const data = {
      sku: product.sku,
      name: product.name,
      description: product.description,
      category: product.category,
      priceCoins: product.priceCoins,
      imageUrl: `/images/products/${product.sku}.svg`,
      active: true,
      seasonCode: product.season?.code ?? null,
      seasonStartsAt: product.season?.startsAt ?? null,
      seasonEndsAt: product.season?.endsAt ?? null,
    };
    await prisma.product.upsert({ where: { sku: product.sku }, create: data, update: data });
  }

  console.log(`Seeded ${coinPackages.length} coin packages and ${products.length} products.`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
