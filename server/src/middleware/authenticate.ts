import type { NextFunction, Request, Response } from "express";
import { config } from "../config.js";
import { AppError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { verifySessionToken } from "../modules/auth/tokens.js";

export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
}

/** The session token comes from the httpOnly cookie, or a Bearer header for API clients. */
function readToken(req: Request): string | null {
  const cookieToken: unknown = req.cookies?.[config.auth.cookieName];
  if (typeof cookieToken === "string" && cookieToken.length > 0) return cookieToken;

  const header = req.get("Authorization");
  if (header?.startsWith("Bearer ")) return header.slice("Bearer ".length);

  return null;
}

/**
 * Resolves the session to an active user. The user is re-read on every
 * request so that suspending an account takes effect immediately.
 */
async function resolveUser(req: Request): Promise<AuthenticatedUser | null> {
  const token = readToken(req);
  if (!token) return null;

  const userId = verifySessionToken(token);
  if (!userId) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, displayName: true, status: true },
  });
  if (!user || user.status !== "ACTIVE") return null;

  return { id: user.id, email: user.email, displayName: user.displayName };
}

/** Rejects the request with 401 unless it carries a valid session. */
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  const user = await resolveUser(req);
  if (!user) throw AppError.unauthorized("UNAUTHENTICATED", "Authentication required");
  req.user = user;
  next();
}

/** Attaches the user when a valid session is present, but never rejects. */
export async function optionalAuthenticate(req: Request, _res: Response, next: NextFunction) {
  req.user = (await resolveUser(req)) ?? undefined;
  next();
}

/**
 * The authenticated user for a route mounted behind `authenticate`. All
 * account data is scoped by this id, never by an id taken from the request,
 * so users cannot reach each other's data by editing a URL.
 */
export function currentUser(req: Request): AuthenticatedUser {
  if (!req.user) throw AppError.unauthorized("UNAUTHENTICATED", "Authentication required");
  return req.user;
}
