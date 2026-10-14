import jwt from "jsonwebtoken";
import { config } from "../../config.js";

const ISSUER = "coin-vault";

interface SessionClaims {
  sub: string; // user id
}

export function signSessionToken(userId: string): string {
  return jwt.sign({}, config.auth.jwtSecret, {
    algorithm: "HS256",
    issuer: ISSUER,
    subject: userId,
    expiresIn: config.auth.jwtTtlSeconds,
  });
}

/** Returns the user id from a valid token, or null for any invalid/expired token. */
export function verifySessionToken(token: string): string | null {
  try {
    const claims = jwt.verify(token, config.auth.jwtSecret, {
      algorithms: ["HS256"],
      issuer: ISSUER,
    }) as SessionClaims;
    return typeof claims.sub === "string" ? claims.sub : null;
  } catch {
    return null;
  }
}
