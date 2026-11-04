import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";
import jwt from "jsonwebtoken";
import type { Role } from "@shared/constants";
import type { LoginInput, SessionUser } from "@shared/schemas/auth";
import { env } from "../../config/env";
import { pool } from "../../db/pool";
import { HttpError, notFound } from "../../lib/http-error";
import { loginLimiter } from "../../lib/login-limiter";
import * as authRepository from "./auth.repository";

/** Una jornada: la sesión sobrevive a recargas de la página, pero no queda abierta para siempre. */
const SESSION_DURATION = "12h";
const BCRYPT_ROUNDS = 10;

export const hashPassword = (password: string) => bcrypt.hash(password, BCRYPT_ROUNDS);

/** Huella de la contraseña dentro del token: al cambiarla, los tokens anteriores dejan de servir. */
const passwordStamp = (passwordHash: string) => createHash("sha256").update(passwordHash).digest("hex").slice(0, 16);

function signSession({ id, username, role, passwordHash }: authRepository.UserRow): string {
  return jwt.sign({ id, username, role, stamp: passwordStamp(passwordHash) }, env.JWT_SECRET, { expiresIn: SESSION_DURATION });
}

export async function login({ role, password }: LoginInput, clientIp: string): Promise<{ user: SessionUser; token: string }> {
  const attemptKey = `${clientIp}:${role}`;
  loginLimiter.assertAllowed(attemptKey);

  const found = await authRepository.findUserByRole(pool, role);
  const passwordMatches = found ? await bcrypt.compare(password, found.passwordHash) : false;
  if (!found || !passwordMatches) {
    loginLimiter.recordFailure(attemptKey);
    // Mismo mensaje en ambos casos para no revelar qué falló
    throw new HttpError(401, "Contraseña incorrecta");
  }

  loginLimiter.recordSuccess(attemptKey);
  return { user: { id: found.id, username: found.username, role: found.role }, token: signSession(found) };
}

/** Valida el token de una petición. Rechaza los vencidos y los emitidos antes de cambiar la contraseña. */
export async function verifySession(token: string): Promise<SessionUser> {
  const expired = new HttpError(401, "Tu sesión expiró. Inicia sesión de nuevo");

  let payload: { id: number; stamp?: string };
  try {
    payload = jwt.verify(token, env.JWT_SECRET) as typeof payload;
  } catch {
    throw expired;
  }

  const user = await authRepository.findUserWithHashById(pool, payload.id);
  if (!user || payload.stamp !== passwordStamp(user.passwordHash)) throw expired;
  return { id: user.id, username: user.username, role: user.role };
}

/** Token nuevo para quien acaba de cambiar su propia contraseña, para no sacarlo de su sesión. */
export async function issueSessionToken(userId: number): Promise<string> {
  const user = await authRepository.findUserWithHashById(pool, userId);
  if (!user) throw notFound("el usuario");
  return signSession(user);
}

export async function getUser(id: number): Promise<SessionUser> {
  const user = await authRepository.findUserById(pool, id);
  if (!user) throw notFound("el usuario");
  return user;
}

/** Devuelve el id del usuario cuya contraseña cambió. */
export async function changePassword(role: Role, newPassword: string): Promise<number> {
  const userId = await authRepository.updatePasswordHash(pool, role, await hashPassword(newPassword));
  if (!userId) throw notFound("el usuario");
  return userId;
}
