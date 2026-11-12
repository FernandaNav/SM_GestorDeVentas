import bcrypt from "bcryptjs";
import { createHash, randomInt } from "node:crypto";
import jwt from "jsonwebtoken";
import type { Role } from "@shared/constants";
import type { LoginInput, RecoverPasswordInput, RecoveryCodeStatus, SessionUser } from "@shared/schemas/auth";
import { env } from "../../config/env";
import { pool, withTransaction, type Queryable } from "../../db/pool";
import { recordAuditAs } from "../../lib/audit";
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

// ─── código de recuperación del Administrador ───────────────────────────────
// Sin letras ni números que se confundan al leerlos impresos (0/O, 1/I/L)
const RECOVERY_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const RECOVERY_LENGTH = 12;

/** Se compara sin guiones, espacios ni mayúsculas: así da igual cómo lo escriba. */
const normalizeRecoveryCode = (code: string) => code.toUpperCase().replace(/[^0-9A-Z]/g, "");

/** Código nuevo con formato XXXX-XXXX-XXXX para leerlo y copiarlo fácil. */
function newRecoveryCode(): string {
  const chars = Array.from({ length: RECOVERY_LENGTH }, () => RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)]);
  return chars.join("").match(/.{4}/g)!.join("-");
}

export async function getRecoveryCodeStatus(): Promise<RecoveryCodeStatus> {
  const row = await authRepository.findRecoveryCode(pool, "Administrador");
  return { hasCode: Boolean(row?.codeHash), createdAt: row?.createdAt?.toISOString() ?? null };
}

/** Crea un código nuevo (el anterior deja de servir). Es la única vez que se puede ver: solo se guarda cifrado. */
export async function createRecoveryCode(db: Queryable = pool): Promise<{ code: string; userId: number }> {
  const code = newRecoveryCode();
  const userId = await authRepository.updateRecoveryCodeHash(db, "Administrador", await bcrypt.hash(normalizeRecoveryCode(code), BCRYPT_ROUNDS));
  if (!userId) throw notFound("el usuario");
  return { code, userId };
}

/**
 * Cambia la contraseña del Administrador con su código de recuperación. El código se gasta: se
 * devuelve uno nuevo para guardarlo. Tiene el mismo freno que el login contra quien intente adivinar.
 */
export async function recoverAdminPassword({ code, newPassword }: RecoverPasswordInput, clientIp: string): Promise<string> {
  const attemptKey = `${clientIp}:recuperacion`;
  loginLimiter.assertAllowed(attemptKey);

  const found = await authRepository.findRecoveryCode(pool, "Administrador");
  const codeMatches = found?.codeHash ? await bcrypt.compare(normalizeRecoveryCode(code), found.codeHash) : false;
  if (!found || !codeMatches) {
    loginLimiter.recordFailure(attemptKey);
    throw new HttpError(401, "El código de recuperación no es correcto");
  }
  loginLimiter.recordSuccess(attemptKey);

  const passwordHash = await hashPassword(newPassword);
  return withTransaction(async (client) => {
    // Cambiar la contraseña también cierra las sesiones abiertas de esa cuenta
    await authRepository.updatePasswordHash(client, "Administrador", passwordHash);
    const { code: nextCode } = await createRecoveryCode(client);
    await recordAuditAs(client, found, clientIp, { action: "recuperar_contraseña", entity: "users", entityId: found.id });
    return nextCode;
  });
}

/** Devuelve el id del usuario cuya contraseña cambió. */
export async function changePassword(role: Role, newPassword: string): Promise<number> {
  const userId = await authRepository.updatePasswordHash(pool, role, await hashPassword(newPassword));
  if (!userId) throw notFound("el usuario");
  return userId;
}
