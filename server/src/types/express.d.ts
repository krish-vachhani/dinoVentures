import type { AuthenticatedUser } from "../middleware/authenticate.js";

declare global {
  namespace Express {
    interface Request {
      /** Set by the `authenticate` / `optionalAuthenticate` middleware. */
      user?: AuthenticatedUser;
    }
  }
}

export {};
