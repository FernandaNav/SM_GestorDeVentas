import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { Role } from "@shared/constants";
import type { LoginInput, SessionUser } from "@shared/schemas/auth";
import { env } from "../../config/env";
import { pool } from "../../db/pool";
import { HttpError, notFound } from "../../lib/http-error";
import * as authRepository from "./auth.repository";

/** Una jornada: la sesión sobrevive a recargas de la página, pero no queda abierta para siempre. */
const SESSION_DURATION = "12h";
const BCRYPT_ROUNDS = 10;

export const hashPassword = (password: string) => bcrypt.hash(password, BCRYPT_ROUNDS);

export async function login({ role, password }: LoginInput): Promise<{ user: SessionUser; token: string }> {
  const found = await authRepository.findUserByRole(pool, role);
  const passwordMatches = found ? await bcrypt.compare(password, found.passwordHash) : false;
  if (!found || !passwordMatches) {
    // Mismo mensaje en ambos casos para no revelar qué falló
    throw new HttpError(401, "Contraseña incorrecta");
  }

  const user: SessionUser = { id: found.id, username: found.username, role: found.role };
  const token = jwt.sign(user, env.JWT_SECRET, { expiresIn: SESSION_DURATION });
  return { user, token };
}

export async function getUser(id: number): Promise<SessionUser> {
  const user = await authRepository.findUserById(pool, id);
  if (!user) throw notFound("Usuario");
  return user;
}

/** Devuelve el id del usuario cuya contraseña cambió. */
export async function changePassword(role: Role, newPassword: string): Promise<number> {
  const userId = await authRepository.updatePasswordHash(pool, role, await hashPassword(newPassword));
  if (!userId) throw notFound("Usuario");
  return userId;
}
