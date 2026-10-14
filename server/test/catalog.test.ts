import supertest from "supertest";
import { describe, expect, it } from "vitest";
import { createCoinPackage, createProduct, fundWallet, newApp, purchase, registerUser } from "./helpers/fixtures.js";

describe("FR-5 product catalog", () => {
  it("lists only active products", async () => {
    const visible = await createProduct({ name: "Visible" });
    await createProduct({ name: "Hidden", active: false });

    const response = await supertest(newApp()).get("/api/products").expect(200);

    expect(response.body.items.map((item: { id: string }) => item.id)).toEqual([visible.id]);
  });

  it("filters by category", async () => {
    await createProduct({ category: "SKIN" });
    const emote = await createProduct({ category: "EMOTE" });
    const pass = await createProduct({ category: "BATTLE_PASS" });

    const emotes = await supertest(newApp()).get("/api/products?category=EMOTE").expect(200);
    const passes = await supertest(newApp()).get("/api/products?category=BATTLE_PASS").expect(200);

    expect(emotes.body.items.map((item: { id: string }) => item.id)).toEqual([emote.id]);
    expect(passes.body.items).toHaveLength(1);
    expect(passes.body.items[0]).toMatchObject({ id: pass.id, season: { code: "S1" } });
  });

  it("rejects an unknown category", async () => {
    const response = await supertest(newApp()).get("/api/products?category=WEAPON").expect(400);
    expect(response.body.error.code).toBe("VALIDATION_FAILED");
  });

  it("returns 404 for an inactive product's detail page", async () => {
    const hidden = await createProduct({ active: false });
    await supertest(newApp()).get(`/api/products/${hidden.id}`).expect(404);
  });

  it("marks owned products for a signed-in user only", async () => {
    const app = newApp();
    const product = await createProduct({ priceCoins: 50 });
    const user = await registerUser(app);
    await fundWallet(user, 50);
    await purchase(user, product.id).expect(201);

    const signedIn = await user.agent.get("/api/products").expect(200);
    const anonymous = await supertest(app).get("/api/products").expect(200);

    expect(signedIn.body.items[0].owned).toBe(true);
    expect(anonymous.body.items[0].owned).toBeUndefined();
  });
});

describe("FR-3 coin packages", () => {
  it("lists only active packages, with totals including bonus coins", async () => {
    await createCoinPackage({ name: "Gamer", baseCoins: 550, bonusCoins: 50, priceMinor: 49_900 });
    await createCoinPackage({ name: "Retired", active: false });

    const response = await supertest(newApp()).get("/api/coin-packages").expect(200);

    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0]).toMatchObject({
      name: "Gamer",
      baseCoins: 550,
      bonusCoins: 50,
      totalCoins: 600,
      priceMinor: 49_900,
      currency: "INR",
    });
  });
});
