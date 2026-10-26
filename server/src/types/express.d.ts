import type { SessionUser } from "@shared/schemas/auth";

declare global {
  namespace Express {
    interface Request {
      /** Lo llena el middleware authenticate. */
      user?: SessionUser;
    }
  }
}

export {};
