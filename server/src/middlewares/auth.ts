import type { NextFunction, Request, Response } from "express";
import type { Role } from "@shared/constants";
import type { SessionUser } from "@shared/schemas/auth";
import { HttpError } from "../lib/http-error";
import { verifySession } from "../modules/auth/auth.service";

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw new HttpError(401, "Inicia sesión para continuar");
  }
  req.user = await verifySession(header.slice(7));
  next();
}

/** Usar después de authenticate. Restringe la ruta a los roles indicados. */
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      throw new HttpError(403, "No tienes permiso para esta acción");
    }
    next();
  };
}

/** El usuario de la sesión. Solo llamar en rutas protegidas por authenticate. */
export function currentUser(req: Request): SessionUser {
  if (!req.user) throw new HttpError(401, "Inicia sesión para continuar");
  return req.user;
}
