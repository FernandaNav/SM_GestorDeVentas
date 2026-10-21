import { z } from "zod";
import { STAFF_TYPES, type StaffType } from "../constants";

export type StaffMember = {
  id: number;
  fullName: string;
  type: StaffType;
  phone: string | null;
  isActive: boolean;
};

export const staffInputSchema = z.object({
  fullName: z.string().trim().min(3, "Escribe el nombre completo").max(100, "Máximo 100 caracteres"),
  type: z.enum(STAFF_TYPES, { message: "Elige Vendedor o Mecánico" }),
  // Opcional: vacío se guarda como null
  phone: z
    .string()
    .trim()
    .transform((value) => value || null)
    .pipe(z.string().regex(/^[0-9 +-]{8,15}$/, "Teléfono inválido (ej. 5512-3344)").nullable())
    .nullish(),
});
export type StaffInput = z.infer<typeof staffInputSchema>;

export const staffFiltersSchema = z.object({
  type: z.enum(STAFF_TYPES).optional(),
  // En la URL llega como texto: "true" / "false"
  active: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});
export type StaffFilters = z.infer<typeof staffFiltersSchema>;

export const staffActiveSchema = z.object({ isActive: z.boolean() });
