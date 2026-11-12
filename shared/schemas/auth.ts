import { z } from "zod";
import { ROLES } from "../constants";

const roleSchema = z.enum(ROLES, { message: "Elige Administrador o Empleado" });

export const loginSchema = z.object({
  role: roleSchema,
  password: z.string().min(1, "Ingresa la contraseña"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z.object({
  role: roleSchema,
  newPassword: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/** Recuperar la contraseña del Administrador con su código de recuperación, desde el login. */
export const recoverPasswordSchema = z.object({
  code: z.string().trim().min(1, "Escribe el código de recuperación"),
  newPassword: changePasswordSchema.shape.newPassword,
});
export type RecoverPasswordInput = z.infer<typeof recoverPasswordSchema>;

/** Si el Administrador ya tiene un código guardado y desde cuándo (nunca se devuelve el código). */
export type RecoveryCodeStatus = { hasCode: boolean; createdAt: string | null };

/** Usuario de la sesión: lo que viaja dentro del token y lo que recibe el frontend. */
export type SessionUser = {
  id: number;
  username: string;
  role: z.infer<typeof loginSchema>["role"];
};
