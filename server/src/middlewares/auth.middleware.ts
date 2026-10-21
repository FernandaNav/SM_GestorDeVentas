import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "solomotos_secret_jwt_key_2026_super_segura";

export interface AuthenticatedUser {
  id: string;
  email: string;
  nombre: string;
  rol: "Administrador" | "Empleado";
}

export interface AuthRequest extends Request {
  user?: AuthenticatedUser;
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({
      ok: false,
      error: "Acceso no autorizado: No se proporcionó token de sesión",
    });
    return;
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthenticatedUser;
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({
      ok: false,
      error: "Sesión inválida o expirada. Por favor ingresa nuevamente.",
    });
  }
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user || req.user.rol !== "Administrador") {
    res.status(403).json({
      ok: false,
      error: "Permiso denegado: Esta acción requiere rol de Administrador",
    });
    return;
  }
  next();
}
