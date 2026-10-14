import supertest from "supertest";
import { describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { newApp, registerUser } from "./helpers/fixtures.js";

describe("FR-1 authentication", () => {
  it("registers a user, starts a session, and creates a zero-balance wallet", async () => {
    const app = newApp();
    const agent = supertest.agent(app);

    const response = await agent
      .post("/api/auth/register")
      .send({ email: "  Gamer@Example.com ", password: "correct-horse-battery", displayName: "Gamer" })
      .expect(201);

    expect(response.body.user).toMatchObject({ email: "gamer@example.com", displayName: "Gamer", balance: 0 });
    expect(response.headers["set-cookie"]?.[0]).toMatch(/cv_session=.+HttpOnly/i);

    const me = await agent.get("/api/auth/me").expect(200);
    expect(me.body.user).toMatchObject({ email: "gamer@example.com", balance: 0 });

    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: response.body.user.id } });
    expect(wallet.balance).toBe(0);
  });

  it("never stores the plaintext password", async () => {
    const user = await registerUser(newApp(), { password: "my-secret-password" });
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });

    expect(stored.passwordHash).not.toContain("my-secret-password");
    expect(stored.passwordHash).toMatch(/^\$2[aby]\$/); // bcrypt
  });

  it("rejects a duplicate email, case-insensitively", async () => {
    const app = newApp();
    await registerUser(app, { email: "taken@example.com" });

    const response = await supertest(app)
      .post("/api/auth/register")
      .send({ email: "TAKEN@example.com", password: "another-password", displayName: "Copycat" })
      .expect(409);

    expect(response.body.error.code).toBe("EMAIL_TAKEN");
  });

  it("validates registration input", async () => {
    const response = await supertest(newApp())
      .post("/api/auth/register")
      .send({ email: "not-an-email", password: "short", displayName: "x" })
      .expect(400);

    expect(response.body.error.code).toBe("VALIDATION_FAILED");
    const fields = response.body.error.details.map((detail: { field: string }) => detail.field);
    expect(fields).toEqual(expect.arrayContaining(["email", "password", "displayName"]));
  });

  it("logs in with valid credentials", async () => {
    const app = newApp();
    await registerUser(app, { email: "login@example.com", password: "correct-horse-battery" });

    const agent = supertest.agent(app);
    await agent.post("/api/auth/login").send({ email: "login@example.com", password: "correct-horse-battery" }).expect(200);
    await agent.get("/api/wallet").expect(200);
  });

  it("rejects a wrong password and an unknown email with the same error", async () => {
    const app = newApp();
    await registerUser(app, { email: "login@example.com", password: "correct-horse-battery" });

    const wrongPassword = await supertest(app)
      .post("/api/auth/login")
      .send({ email: "login@example.com", password: "wrong-password" })
      .expect(401);
    const unknownEmail = await supertest(app)
      .post("/api/auth/login")
      .send({ email: "nobody@example.com", password: "wrong-password" })
      .expect(401);

    expect(wrongPassword.body.error.code).toBe("INVALID_CREDENTIALS");
    expect(unknownEmail.body.error).toEqual(wrongPassword.body.error);
  });

  it("rejects suspended accounts at login and on existing sessions", async () => {
    const app = newApp();
    const user = await registerUser(app, { email: "banned@example.com", password: "correct-horse-battery" });
    await prisma.user.update({ where: { id: user.id }, data: { status: "SUSPENDED" } });

    await user.agent.get("/api/wallet").expect(401);
    const login = await supertest(app)
      .post("/api/auth/login")
      .send({ email: "banned@example.com", password: "correct-horse-battery" })
      .expect(403);
    expect(login.body.error.code).toBe("ACCOUNT_DISABLED");
  });

  it.each([
    ["GET", "/api/auth/me"],
    ["GET", "/api/wallet"],
    ["GET", "/api/wallet/transactions"],
    ["GET", "/api/topups"],
    ["POST", "/api/topups"],
    ["GET", "/api/orders"],
    ["POST", "/api/orders"],
    ["GET", "/api/inventory"],
  ])("rejects unauthenticated %s %s", async (method, path) => {
    const request = supertest(newApp());
    const response = await (method === "GET" ? request.get(path) : request.post(path).send({})).expect(401);
    expect(response.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("rejects a forged or tampered token", async () => {
    await supertest(newApp())
      .get("/api/wallet")
      .set("Authorization", "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.forged")
      .expect(401);
  });

  it("ends the session on logout", async () => {
    const user = await registerUser();
    await user.agent.post("/api/auth/logout").expect(204);
    await user.agent.get("/api/auth/me").expect(401);
  });
});
