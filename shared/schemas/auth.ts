import { z } from "zod";
import { ROLES } from "../constants";

export const loginSchema = z.object({
  role: z.enum(ROLES),
  password: z.string().min(1, "Ingresa la contraseña"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z.object({
  role: z.enum(ROLES),
  newPassword: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/** Usuario de la sesión: lo que viaja dentro del token y lo que recibe el frontend. */
export type SessionUser = {
  id: number;
  username: string;
  role: z.infer<typeof loginSchema>["role"];
};
