import { Router, type CookieOptions, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import { config } from "../../config.js";
import { parseOrThrow } from "../../lib/http.js";
import { authenticate, currentUser } from "../../middleware/authenticate.js";
import { loginSchema, registerSchema } from "./auth.schemas.js";
import { getAccount, registerUser, verifyCredentials } from "./auth.service.js";
import { signSessionToken } from "./tokens.js";

export const authRouter = Router();

// Slows down credential stuffing. Disabled in tests, which register many users.
const credentialRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  skip: () => config.isTest,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Too many attempts, please try again later" } },
});

const sessionCookieOptions: CookieOptions = {
  httpOnly: true, // not readable from JavaScript, so XSS cannot steal the session
  secure: config.isProduction,
  sameSite: "lax", // not sent on cross-site POSTs, which blocks CSRF on state-changing routes
  path: "/",
};

function startSession(res: Response, userId: string) {
  res.cookie(config.auth.cookieName, signSessionToken(userId), {
    ...sessionCookieOptions,
    maxAge: config.auth.jwtTtlSeconds * 1000,
  });
}

authRouter.post("/register", credentialRateLimit, async (req, res) => {
  const input = parseOrThrow(registerSchema, req.body);
  const account = await registerUser(input);
  startSession(res, account.id);
  res.status(201).json({ user: { ...account, balance: 0 } });
});

authRouter.post("/login", credentialRateLimit, async (req, res) => {
  const input = parseOrThrow(loginSchema, req.body);
  const account = await verifyCredentials(input);
  startSession(res, account.id);
  res.json({ user: await getAccount(account.id) });
});

authRouter.post("/logout", (_req, res) => {
  res.clearCookie(config.auth.cookieName, sessionCookieOptions);
  res.status(204).end();
});

authRouter.get("/me", authenticate, async (req, res) => {
  res.json({ user: await getAccount(currentUser(req).id) });
});
