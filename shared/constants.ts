// Valores compartidos entre frontend y backend. Deben coincidir con los CHECK de
// server/db/migrations/001_esquema.sql.

export const ROLES = ["Administrador", "Empleado"] as const;
export type Role = (typeof ROLES)[number];

export const STAFF_TYPES = ["Vendedor", "Mecánico"] as const;
export type StaffType = (typeof STAFF_TYPES)[number];

export const PAYMENT_METHODS = ["Efectivo", "Transferencia", "Tarjeta"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const TAX_ID_TYPES = ["NIT", "CUI", "CF"] as const;
export type TaxIdType = (typeof TAX_ID_TYPES)[number];

export const SALE_ITEM_ORIGINS = ["venta", "taller_servicio", "taller_repuesto"] as const;
export type SaleItemOrigin = (typeof SALE_ITEM_ORIGINS)[number];

export const WORKSHOP_STATUSES = ["Recibida", "En reparación", "Lista para entregar", "Entregada"] as const;
export type WorkshopStatus = (typeof WORKSHOP_STATUSES)[number];

export const EXPENSE_CATEGORIES = ["Servicios", "Repuestos", "Renta", "Planilla", "Otros"] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

/** La SAT exige NIT o CUI del comprador desde este monto (Q). */
export const CF_MAX_INVOICE_TOTAL = 2500;

/** Cada cuánto las pantallas vuelven a pedir sus datos (RF 6.3). */
export const POLL_INTERVAL_MS = 10_000;
