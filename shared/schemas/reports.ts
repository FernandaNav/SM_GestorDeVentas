import { z } from "zod";
import { PAYMENT_METHODS, type PaymentMethod, type SaleItemOrigin } from "../constants";
import type { DateRange } from "./common";

// ─── entrada ────────────────────────────────────────────────────────────────

const isoDay = z.string({ required_error: "Indica la fecha (AAAA-MM-DD)" }).date("Fecha inválida (usa AAAA-MM-DD)");
const optionalId = z.coerce.number().int().positive().optional();

/**
 * Filtros de Estadísticas (RF 4.1 a 4.5). compareFrom/compareTo son el período contra el
 * que se compara; los manda la pantalla porque "el mes anterior" no siempre dura lo mismo.
 */
export const statsFiltersSchema = z
  .object({
    from: isoDay,
    to: isoDay,
    paymentMethod: z.enum(PAYMENT_METHODS, { message: "Método de pago inválido" }).optional(),
    sellerId: optionalId,
    categoryId: optionalId,
    compareFrom: isoDay.optional(),
    compareTo: isoDay.optional(),
  })
  .refine(({ from, to }) => from <= to, { message: "La fecha inicial debe ser anterior a la final", path: ["to"] })
  .refine(({ compareFrom, compareTo }) => (compareFrom === undefined) === (compareTo === undefined), {
    message: "Indica el inicio y el fin del período a comparar",
    path: ["compareTo"],
  })
  .refine(({ compareFrom, compareTo }) => !compareFrom || !compareTo || compareFrom <= compareTo, {
    message: "La fecha inicial debe ser anterior a la final",
    path: ["compareTo"],
  });
export type StatsFilters = z.infer<typeof statsFiltersSchema>;

// ─── agrupación de la gráfica en el tiempo ──────────────────────────────────

export type StatsBucket = "hour" | "day" | "month";

/** Un día se ve por hora; hasta dos meses, por día; más largo, por mes. */
export function statsBucketFor({ from, to }: DateRange): StatsBucket {
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
  if (days <= 1) return "hour";
  if (days <= 62) return "day";
  return "month";
}

// ─── salida ─────────────────────────────────────────────────────────────────

export type SalesTotals = {
  total: number;
  salesCount: number;
  averageTicket: number;
  invoicedCount: number;
  commissionTotal: number;
  /** Artículos con comisión sin asignar */
  pendingItems: number;
};

/**
 * Un punto de la gráfica. `bucket` es la hora ("2026-10-21T14"), el día ("2026-10-21")
 * o el mes ("2026-10") en hora de Guatemala.
 */
export type SeriesPoint = { bucket: string; sales: number; salesCount: number; expenses: number };

export type PaymentBreakdown = { paymentMethod: PaymentMethod; total: number; salesCount: number };
export type SellerBreakdown = { sellerId: number; sellerName: string; total: number; salesCount: number; commissionTotal: number };
export type CategoryBreakdown = { categoryId: number; categoryName: string; total: number; quantity: number };
export type OriginBreakdown = { origin: SaleItemOrigin; total: number; quantity: number };
export type ExpenseBreakdown = { category: string; total: number; count: number };

export type StatsPeriod = {
  range: DateRange;
  totals: SalesTotals;
  series: SeriesPoint[];
  byPaymentMethod: PaymentBreakdown[];
  bySeller: SellerBreakdown[];
  byCategory: CategoryBreakdown[];
  /** Ventas de mostrador vs. servicios y repuestos cobrados en taller */
  byOrigin: OriginBreakdown[];
  expenses: { total: number; count: number; byCategory: ExpenseBreakdown[] };
  workshop: { ordersReceived: number; ordersDelivered: number };
};

export type StatsReport = {
  bucket: StatsBucket;
  current: StatsPeriod;
  /** null si no se pidió comparación */
  previous: StatsPeriod | null;
  /** Órdenes de taller sin entregar en este momento */
  activeWorkshopOrders: number;
};

export type RecentSale = {
  id: number;
  soldAt: string;
  sellerName: string;
  paymentMethod: PaymentMethod;
  isInvoiced: boolean;
  itemsSummary: string;
  total: number;
};

export type DashboardSummary = {
  /** Día de hoy en Guatemala según el servidor (AAAA-MM-DD) */
  today: string;
  todaySales: { total: number; count: number };
  monthSales: { total: number; count: number };
  /** Mes anterior hasta el mismo día, para comparar */
  previousMonthSales: { total: number; count: number };
  commissions: { total: number; pendingItems: number; pendingSales: number };
  expenses: { total: number; count: number };
  invoices: { issued: number; limit: number; alertPercent: number };
  sellers: { currentMonth: SellerBreakdown[]; previousMonth: SellerBreakdown[] };
  /** Ventas y gastos por día, del 1 del mes a hoy */
  dailySeries: SeriesPoint[];
  recentSales: RecentSale[];
};

/** Inicio del empleado: lo del día, sin montos del negocio (RNF 1.3). */
export type EmployeeHome = {
  today: string;
  sales: Omit<RecentSale, "total">[];
  workshop: {
    received: number;
    inRepair: number;
    ready: number;
    readyOrders: { id: number; clientName: string; motorcycle: string; plate: string | null }[];
  };
  /** true cuando las facturas del mes llegan al porcentaje de alerta de Configuración */
  invoiceAlert: boolean;
};
