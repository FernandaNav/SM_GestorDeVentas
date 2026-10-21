import { z } from "zod";
import { PAYMENT_METHODS, WORKSHOP_STATUSES, type Role, type WorkshopStatus } from "../constants";
import { saleClientSchema } from "./sales";

// Deben coincidir con el CHECK de workshop_order_items.kind en 001_esquema.sql
export const WORKSHOP_ITEM_KINDS = ["servicio", "repuesto"] as const;
export type WorkshopItemKind = (typeof WORKSHOP_ITEM_KINDS)[number];

/** El estado que sigue en el flujo, o undefined si la orden ya se entregó. */
export function nextWorkshopStatus(status: WorkshopStatus): WorkshopStatus | undefined {
  return WORKSHOP_STATUSES[WORKSHOP_STATUSES.indexOf(status) + 1];
}

// ─── entrada ────────────────────────────────────────────────────────────────

const money = z
  .number({ message: "Ingresa un monto" })
  .nonnegative("El monto no puede ser negativo")
  .max(1_000_000, "Monto demasiado alto")
  .multipleOf(0.01, "Máximo dos decimales");

// Opcionales: vacío se guarda como null
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres`)
    .transform((value) => value || null)
    .nullish();

export const createWorkshopOrderSchema = z.object({
  clientName: z.string().trim().min(2, "Escribe el nombre del cliente").max(100, "Máximo 100 caracteres"),
  clientPhone: z
    .string()
    .trim()
    .transform((value) => value || null)
    .pipe(z.string().regex(/^[0-9 +-]{8,15}$/, "Teléfono inválido (ej. 5512-3344)").nullable())
    .nullish(),
  motorcycle: z.string().trim().min(2, "Escribe la marca y modelo de la moto").max(100, "Máximo 100 caracteres"),
  plate: optionalText(15).transform((value) => value?.toUpperCase() ?? null),
  workDescription: z.string().trim().min(3, "Describe el trabajo solicitado").max(500, "Máximo 500 caracteres"),
  mechanicId: z.number({ message: "Elige el mecánico" }).int().positive("Elige el mecánico"),
  estimatedCost: money.nullish(),
});
export type CreateWorkshopOrderInput = z.infer<typeof createWorkshopOrderSchema>;

export const workshopItemInputSchema = z.object({
  kind: z.enum(WORKSHOP_ITEM_KINDS, { message: "Elige servicio o repuesto" }),
  description: z.string().trim().min(1, "Describe el servicio o repuesto").max(200, "Máximo 200 caracteres"),
  categoryId: z.number({ message: "Elige una categoría" }).int().positive("Elige una categoría"),
  quantity: z.number({ message: "Ingresa la cantidad" }).int("La cantidad debe ser entera").min(1, "La cantidad mínima es 1").max(1000),
  unitPrice: money,
});
export type WorkshopItemInput = z.infer<typeof workshopItemInputSchema>;

export const workshopStatusChangeSchema = z.object({
  status: z.enum(WORKSHOP_STATUSES, { message: "Estado inválido" }),
});

/**
 * Datos para cobrar y entregar. Los artículos salen de la orden; las reglas de la venta
 * (cliente obligatorio al facturar, límite de Consumidor Final) las vuelve a revisar el
 * servidor con createSaleSchema ya con el total real.
 */
export const workshopCheckoutSchema = z
  .object({
    sellerId: z.number({ message: "Elige quién cobra" }).int().positive("Elige quién cobra"),
    paymentMethod: z.enum(PAYMENT_METHODS, { message: "Elige el método de pago" }),
    isInvoiced: z.boolean(),
    client: saleClientSchema.optional(),
    observations: z.string().trim().max(300, "Máximo 300 caracteres").optional(),
  })
  .superRefine((checkout, ctx) => {
    if (checkout.isInvoiced && !checkout.client) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["client"], message: "Los datos del cliente son obligatorios para facturar" });
    }
  });
export type WorkshopCheckoutInput = z.infer<typeof workshopCheckoutSchema>;

export const workshopFiltersSchema = z.object({
  view: z.enum(["activas", "historial"]).default("activas"),
});
export type WorkshopFilters = z.infer<typeof workshopFiltersSchema>;

/** Para /api/workshop/:id/items/:itemId */
export const workshopItemParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
  itemId: z.coerce.number().int().positive(),
});

// ─── salida ─────────────────────────────────────────────────────────────────

export type WorkshopOrderSummary = {
  id: number;
  clientName: string;
  clientPhone: string | null;
  motorcycle: string;
  plate: string | null;
  workDescription: string;
  mechanicId: number;
  mechanicName: string;
  status: WorkshopStatus;
  estimatedCost: number | null;
  /** Lo cobrado; se fija al entregar */
  finalCost: number | null;
  /** Suma de servicios y repuestos registrados hasta ahora */
  itemsTotal: number;
  itemsCount: number;
  saleId: number | null;
  receivedAt: string;
  deliveredAt: string | null;
};

export type WorkshopOrderItem = {
  id: number;
  kind: WorkshopItemKind;
  description: string;
  categoryId: number | null;
  categoryName: string | null;
  quantity: number;
  unitPrice: number;
  subtotal: number;
};

export type WorkshopOrderEvent = {
  id: number;
  description: string;
  createdByRole: Role | null;
  createdAt: string;
};

export type WorkshopOrderDetail = WorkshopOrderSummary & {
  items: WorkshopOrderItem[];
  events: WorkshopOrderEvent[];
};

/** Número visible de la orden: 7 → "OT-0007" */
export const formatOrderNumber = (id: number) => `OT-${id.toString().padStart(4, "0")}`;
