import { z } from "zod";
import type { PaymentMethod } from "../constants";

// ─── entrada ────────────────────────────────────────────────────────────────

const isoDay = z.string({ required_error: "Indica la fecha (AAAA-MM-DD)" }).date("Fecha inválida (usa AAAA-MM-DD)");

/** ?from=AAAA-MM-DD&to=AAAA-MM-DD&sellerId=3&status=pendientes (RF 3.3) */
export const commissionFiltersSchema = z
  .object({
    from: isoDay,
    to: isoDay,
    sellerId: z.coerce.number().int().positive().optional(),
    status: z.enum(["todas", "pendientes"]).default("todas"),
  })
  .refine(({ from, to }) => from <= to, { message: "La fecha inicial debe ser anterior a la final", path: ["to"] });
export type CommissionFilters = z.infer<typeof commissionFiltersSchema>;

/** Asignar el porcentaje a uno o varios artículos con comisión pendiente (RF 3.1, 3.2). */
export const assignCommissionSchema = z.object({
  itemIds: z
    .array(z.number().int().positive())
    .min(1, "Elige al menos un artículo")
    .max(100, "Máximo 100 artículos a la vez")
    .refine((ids) => new Set(ids).size === ids.length, "Hay artículos repetidos"),
  commissionRate: z
    .number({ message: "Ingresa el porcentaje" })
    .min(0, "Mínimo 0 %")
    .max(100, "Máximo 100 %")
    .multipleOf(0.01, "Máximo dos decimales"),
});
export type AssignCommissionInput = z.infer<typeof assignCommissionSchema>;

/** Monto de comisión con la misma regla que la columna calculada de sale_items. */
export const commissionFor = (subtotal: number, rate: number) => Math.round(subtotal * rate) / 100;

// ─── salida ─────────────────────────────────────────────────────────────────

export type CommissionSellerSummary = {
  sellerId: number;
  sellerName: string;
  isActive: boolean;
  salesCount: number;
  totalSold: number;
  commissionTotal: number;
  pendingItems: number;
  /** Suma de los artículos que aún no tienen comisión */
  pendingSubtotal: number;
};

export type CommissionItem = {
  /** id del artículo (sale_items) */
  id: number;
  saleId: number;
  soldAt: string;
  sellerId: number;
  sellerName: string;
  paymentMethod: PaymentMethod;
  description: string;
  categoryName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  /** null = pendiente de asignar */
  commissionRate: number | null;
  commissionAmount: number | null;
  /** El período de la venta ya se cerró: no se puede modificar (RF 7.2) */
  isClosed: boolean;
};
