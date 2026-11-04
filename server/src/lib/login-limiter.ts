import { HttpError } from "./http-error";

const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;

type Attempts = { failures: number; expiresAt: number };

/**
 * Frena a quien intenta adivinar la contraseña: tras varios fallos seguidos bloquea esa
 * combinación de computadora y rol por un rato. Vive en memoria: reiniciar el servidor la limpia.
 */
export function createLoginLimiter(now: () => number = Date.now) {
  const attempts = new Map<string, Attempts>();

  const current = (key: string) => {
    const entry = attempts.get(key);
    if (entry && entry.expiresAt <= now()) {
      attempts.delete(key);
      return undefined;
    }
    return entry;
  };

  return {
    assertAllowed(key: string) {
      const entry = current(key);
      if (!entry || entry.failures < MAX_FAILURES) return;
      const minutes = Math.ceil((entry.expiresAt - now()) / 60_000);
      throw new HttpError(429, `Demasiados intentos fallidos. Intenta de nuevo en ${minutes} ${minutes === 1 ? "minuto" : "minutos"}`);
    },
    recordFailure(key: string) {
      attempts.set(key, { failures: (current(key)?.failures ?? 0) + 1, expiresAt: now() + LOCK_MS });
    },
    recordSuccess(key: string) {
      attempts.delete(key);
    },
  };
}

export const loginLimiter = createLoginLimiter();
