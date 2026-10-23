import { z } from "zod";

/** Datos de la empresa y control de facturas (fila única de la tabla settings). */
export type Settings = {
  companyName: string;
  taxId: string;
  address: string;
  phone: string | null;
  monthlyInvoiceLimit: number;
  invoiceAlertPercent: number;
};

export const settingsInputSchema = z.object({
  companyName: z.string().trim().min(2, "Escribe el nombre comercial").max(120, "Máximo 120 caracteres"),
  taxId: z
    .string()
    .trim()
    .regex(/^\d{1,12}-?[\dkK]$/, "NIT inválido (ej. 8214573-6)"),
  address: z.string().trim().min(5, "Escribe la dirección").max(250, "Máximo 250 caracteres"),
  // Opcional: vacío se guarda como null
  phone: z
    .string()
    .trim()
    .transform((value) => value || null)
    .pipe(z.string().regex(/^[0-9 +-]{8,20}$/, "Teléfono inválido (ej. +502 7765 4321)").nullable())
    .nullish(),
  monthlyInvoiceLimit: z
    .number({ message: "Ingresa un número" })
    .int("Debe ser un número entero")
    .min(1, "Mínimo 1 factura")
    .max(100_000, "Número demasiado alto"),
  invoiceAlertPercent: z
    .number({ message: "Ingresa un número" })
    .int("Debe ser un número entero")
    .min(1, "Mínimo 1 %")
    .max(100, "Máximo 100 %"),
});
export type SettingsInput = z.infer<typeof settingsInputSchema>;

/** Comisión por defecto de una categoría. null = se ingresa a mano en cada venta (RNF 7.1). */
export const categoryCommissionSchema = z.object({
  defaultCommissionRate: z
    .number({ message: "Ingresa un porcentaje" })
    .min(0, "Mínimo 0 %")
    .max(100, "Máximo 100 %")
    .multipleOf(0.01, "Máximo dos decimales")
    .nullable(),
});
export type CategoryCommissionInput = z.infer<typeof categoryCommissionSchema>;