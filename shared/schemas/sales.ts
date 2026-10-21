import { z } from "zod";
import {
  CF_MAX_INVOICE_TOTAL,
  PAYMENT_METHODS,
  TAX_ID_TYPES,
  type PaymentMethod,
  type SaleItemOrigin,
  type TaxIdType,
} from "../constants";

// ─── entrada ────────────────────────────────────────────────────────────────

const money = z
  .number({ message: "Ingresa un monto" })
  .nonnegative("El monto no puede ser negativo")
  .max(10_000_000, "Monto demasiado alto")
  .multipleOf(0.01, "Máximo dos decimales");

export const saleItemInputSchema = z.object({
  description: z.string().trim().min(1, "Describe el producto o servicio").max(200, "Máximo 200 caracteres"),
  categoryId: z.number().int().positive("Elige una categoría"),
  quantity: z.number().int("La cantidad debe ser entera").min(1, "La cantidad mínima es 1").max(1000),
  unitPrice: money,
  /**
   * Porcentaje de comisión. Sin enviar = el de la categoría; null = pendiente de asignar.
   * Solo lo toma en cuenta si quien registra es Administrador.
   */
  commissionRate: z.number().min(0, "Mínimo 0 %").max(100, "Máximo 100 %").nullable().optional(),
});
export type SaleItemInput = z.infer<typeof saleItemInputSchema>;

const NIT_PATTERN = /^\d{1,12}-?[\dkK]$/;
const CUI_PATTERN = /^\d{4} ?\d{5} ?\d{4}$/;

export const saleClientSchema = z
  .object({
    taxIdType: z.enum(TAX_ID_TYPES),
    taxId: z.string().trim(),
    name: z.string().trim().min(1, "Escribe el nombre o razón social").max(150),
    address: z.string().trim().max(250).optional(),
  })
  .superRefine((client, ctx) => {
    const valid =
      (client.taxIdType === "NIT" && NIT_PATTERN.test(client.taxId)) ||
      (client.taxIdType === "CUI" && CUI_PATTERN.test(client.taxId)) ||
      (client.taxIdType === "CF" && client.taxId.toUpperCase() === "CF");
    if (!valid) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["taxId"], message: `${client.taxIdType} inválido` });
    }
  });
export type SaleClientInput = z.infer<typeof saleClientSchema>;

export const createSaleSchema = z
  .object({
    sellerId: z.number().int().positive("Elige el vendedor"),
    paymentMethod: z.enum(PAYMENT_METHODS, { message: "Elige el método de pago" }),
    isInvoiced: z.boolean(),
    client: saleClientSchema.optional(),
    observations: z.string().trim().max(500).optional(),
    items: z.array(saleItemInputSchema).min(1, "Agrega al menos un artículo").max(50),
  })
  .superRefine((sale, ctx) => {
    if (!sale.isInvoiced) return;
    if (!sale.client) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["client"], message: "Los datos del cliente son obligatorios para facturar" });
      return;
    }
    if (sale.client.taxIdType === "CF" && calculateTotal(sale.items) >= CF_MAX_INVOICE_TOTAL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["client", "taxId"],
        message: `Desde Q${CF_MAX_INVOICE_TOTAL.toLocaleString("es-GT")} la SAT exige NIT o CUI del comprador`,
      });
    }
  });
export type CreateSaleInput = z.infer<typeof createSaleSchema>;

/** Suma de cantidad × precio, redondeada a centavos. La usan el formulario y el backend. */
export function calculateTotal(items: Pick<SaleItemInput, "quantity" | "unitPrice">[]): number {
  const cents = items.reduce((sum, item) => sum + Math.round(item.quantity * item.unitPrice * 100), 0);
  return cents / 100;
}

// ─── salida ─────────────────────────────────────────────────────────────────

/** Fila del historial. El empleado la recibe sin los campos de comisión (RNF 1.3). */
export type SaleSummary = {
  id: number;
  soldAt: string;
  sellerName: string;
  paymentMethod: PaymentMethod;
  isInvoiced: boolean;
  clientName: string | null;
  total: number;
  itemsSummary: string;
  commissionAmount?: number;
  hasPendingCommission?: boolean;
};

export type SaleItem = {
  id: number;
  description: string;
  categoryId: number;
  categoryName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  origin: SaleItemOrigin;
  commissionRate?: number | null;
  commissionAmount?: number | null;
};

export type SaleDetail = {
  id: number;
  soldAt: string;
  sellerId: number;
  sellerName: string;
  paymentMethod: PaymentMethod;
  isInvoiced: boolean;
  client: { taxIdType: TaxIdType; taxId: string; name: string; address: string | null } | null;
  observations: string | null;
  total: number;
  items: SaleItem[];
};
