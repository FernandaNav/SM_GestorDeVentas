import type { RecoverPasswordInput, RecoveryCodeStatus } from "@shared/schemas/auth";
import { api } from "./client";

export const authApi = {
  /** Desde el login, sin sesión. Devuelve el código nuevo: el que se usó ya no sirve. */
  recover: (input: RecoverPasswordInput) => api.post<{ recoveryCode: string }>("/auth/recover", input),
  recoveryStatus: () => api.get<RecoveryCodeStatus>("/auth/recovery-code"),
  /** El código solo se ve en esta respuesta: el servidor lo guarda cifrado. */
  createRecoveryCode: () => api.post<{ recoveryCode: string }>("/auth/recovery-code"),
};
