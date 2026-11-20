import { z } from "zod";
import { EXPENSE_AREAS } from "../constants";

// Inventario: productos, motos por unidad (chasis) y kárdex. Ver docs/INVENTARIO.md.

/** Tipos de movimiento del kárdex. Deben coincidir con el CHECK de inventory_movements.kind (007_inventario.sql). */
export const MOVEMENT_KINDS = ["entrada", "ajuste", "baja", "venta", "devolucion_venta", "taller", "devolucion_taller", "correccion"] as const;
export type MovementKind = (typeof MOVEMENT_KINDS)[number];

export const MOVEMENT_LABELS: Record<MovementKind, string> = {
  entrada: "Entrada",
  ajuste: "Ajuste",
  baja: "Baja",
  venta: "Venta",
  devolucion_venta: "Devolución de venta",
  taller: "Usado en taller",
  devolucion_taller: "Devuelto del taller",
  correccion: "Corrección de entrada",
};

export const UNIT_STATUSES = ["disponible", "vendida", "baja"] as const;
export type UnitStatus = (typeof UNIT_STATUSES)[number];

const money = z
  .number({ message: "Ingresa un monto" })
  .nonnegative("El monto no puede ser negativo")
  .max(10_000_000, "Monto demasiado alto")
  .multipleOf(0.01, "Máximo dos decimales");

const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .transform((value) => value.replace(/\s+/g, " "))
    .optional()
    .transform((value) => (value ? value : undefined));

/** Número de chasis o de motor: letras, números y guiones, sin espacios. Se guarda en mayúsculas. */
const serialText = (label: string) =>
  z
    .string()
    .trim()
    .toUpperCase()
    .min(3, `${label}: mínimo 3 caracteres`)
    .max(40, `${label}: máximo 40 caracteres`)
    .regex(/^[A-Z0-9-]+$/, `${label}: solo letras, números y guiones`);

// ─── productos ──────────────────────────────────────────────────────────────

export const productInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Escribe el nombre del producto")
    .max(120, "Máximo 120 caracteres")
    .transform((value) => value.replace(/\s+/g, " ")),
  code: optionalText(40, "Máximo 40 caracteres"),
  categoryId: z.number({ message: "Elige una categoría" }).int().positive("Elige una categoría"),
  salePrice: money,
  /** Costo de compra; opcional (solo lo ve el Administrador) */
  cost: money.nullable().optional(),
  minStock: z.number({ message: "Ingresa un número" }).int("Debe ser un número entero").min(0, "Mínimo 0").max(100_000),
  /** true = cada unidad se registra con su número de chasis (motos). No se puede cambiar si ya tuvo movimientos. */
  tracksUnits: z.boolean(),
});
export type ProductInput = z.infer<typeof productInputSchema>;

export const productActiveSchema = z.object({ isActive: z.boolean({ message: "Indica si queda activo" }) });

/** ?search &categoryId &status=activos|inactivos|todos &lowStock=true &page &pageSize */
export const productFiltersSchema = z.object({
  search: z.string().trim().max(100, "Máximo 100 caracteres").optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  status: z.enum(["activos", "inactivos", "todos"]).default("activos"),
  lowStock: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .transform((value) => (typeof value === "boolean" ? value : value === "true"))
    .optional(),
});
export type ProductFilters = z.infer<typeof productFiltersSchema>;

/** Búsqueda rápida para elegir un producto al vender o en el taller: ?q=casco */
export const productSearchSchema = z.object({
  q: z.string().trim().min(1, "Escribe qué buscar").max(100, "Máximo 100 caracteres"),
});

// ─── movimientos ────────────────────────────────────────────────────────────

const unitInputSchema = z.object({
  serial: serialText("Chasis"),
  engineNumber: serialText("Motor").optional(),
});

/**
 * Entrada de mercadería. Un producto normal manda `quantity`; uno por unidades (motos) manda
 * `units`, una por cada chasis (la cantidad es cuántas unidades). El servidor revisa cuál toca.
 */
export const stockEntrySchema = z
  .object({
    quantity: z.number().int("La cantidad debe ser entera").min(1, "La cantidad mínima es 1").max(100_000).optional(),
    units: z.array(unitInputSchema).min(1, "Agrega al menos una unidad").max(50, "Máximo 50 unidades por entrada").optional(),
    unitCost: money.optional(),
    note: optionalText(200, "Máximo 200 caracteres"),
    /** Registrar también la compra en Gastos (categoría Mercadería), con el área que se elija. */
    expense: z.object({ area: z.enum(EXPENSE_AREAS, { message: "Elige Tienda o Taller" }) }).optional(),
  })
  .superRefine((entry, ctx) => {
    if (entry.expense && !(entry.unitCost && entry.unitCost > 0)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["unitCost"], message: "Para registrarla como gasto, indica el costo por unidad" });
    }
    if ((entry.quantity === undefined) === (entry.units === undefined)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["quantity"], message: "Indica la cantidad que entra" });
    }
    const serials = (entry.units ?? []).map((unit) => unit.serial);
    serials.forEach((serial, index) => {
      if (serials.indexOf(serial) !== index) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["units", index, "serial"], message: "Chasis repetido en esta entrada" });
      }
    });
  });
export type StockEntryInput = z.infer<typeof stockEntrySchema>;

/** Ajuste por conteo físico (solo productos normales): se dice cuántos hay de verdad y por qué. */
export const stockAdjustmentSchema = z.object({
  countedStock: z.number({ message: "Ingresa cuántos hay" }).int("Debe ser un número entero").min(0, "Mínimo 0").max(100_000),
  reason: z.string().trim().min(3, "Explica el motivo del ajuste").max(200, "Máximo 200 caracteres"),
});
export type StockAdjustmentInput = z.infer<typeof stockAdjustmentSchema>;

/** Corregir los datos de una moto que sigue disponible (por ejemplo, un chasis mal escrito). */
export const unitUpdateSchema = z.object({
  serial: serialText("Chasis"),
  engineNumber: serialText("Motor").nullable().optional(),
});
export type UnitUpdateInput = z.infer<typeof unitUpdateSchema>;

/**
 * Dar de baja una moto disponible (dañada, robada, devuelta al proveedor). Con `wasError`, la moto
 * se registró por error (nunca llegó): su costo también sale del gasto de esa entrada.
 */
export const unitRetireSchema = z.object({
  reason: z.string().trim().min(3, "Explica el motivo de la baja").max(200, "Máximo 200 caracteres"),
  wasError: z.boolean().optional(),
});

/** Corregir una entrada mal registrada: la cantidad y el costo que debieron ser, con su motivo. */
export const entryCorrectionSchema = z.object({
  quantity: z.number({ message: "Indica la cantidad correcta" }).int("La cantidad debe ser entera").min(0, "Mínimo 0").max(100_000),
  unitCost: money.optional(),
  reason: z.string().trim().min(3, "Explica qué se corrige").max(200, "Máximo 200 caracteres"),
});
export type EntryCorrectionInput = z.infer<typeof entryCorrectionSchema>;

export const movementParamsSchema = z.object({ movementId: z.coerce.number().int().positive("Movimiento inválido") });

export const unitParamsSchema = z.object({ unitId: z.coerce.number().int().positive("Unidad inválida") });

// ─── salida ─────────────────────────────────────────────────────────────────

export type Product = {
  id: number;
  code: string | null;
  name: string;
  categoryId: number;
  categoryName: string;
  salePrice: number;
  /** Solo para el Administrador */
  cost?: number | null;
  tracksUnits: boolean;
  stock: number;
  minStock: number;
  /** stock ≤ minStock (y minStock > 0) */
  isLow: boolean;
  isActive: boolean;
  /** Ya tuvo movimientos: no se puede cambiar si es por unidades */
  hasMovements: boolean;
};

export type ProductUnit = {
  id: number;
  productId: number;
  serial: string;
  engineNumber: string | null;
  status: UnitStatus;
  createdAt: string;
};

export type ProductDetail = Product & { units: ProductUnit[] };

/** Resultado de la búsqueda rápida (para elegir un producto al vender o en el taller). */
export type ProductOption = {
  id: number;
  code: string | null;
  name: string;
  categoryId: number;
  salePrice: number;
  tracksUnits: boolean;
  stock: number;
};

export type InventoryMovement = {
  id: number;
  productId: number;
  unitId: number | null;
  unitSerial: string | null;
  kind: MovementKind;
  quantity: number;
  stockAfter: number;
  unitCost: number | null;
  saleId: number | null;
  workshopOrderId: number | null;
  note: string | null;
  createdByRole: string | null;
  createdAt: string;
  expenseId: number | null;
  correctsMovementId: number | null;
  /** Solo en las entradas: cantidad y costo vigentes después de sus correcciones */
  effectiveQuantity: number | null;
  effectiveUnitCost: number | null;
};

export type InventorySummary = {
  activeProducts: number;
  lowStock: number;
  outOfStock: number;
  /** Suma de existencias × costo de los productos que tienen costo */
  stockValue: number;
  availableUnits: number;
};
