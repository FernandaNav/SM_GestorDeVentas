import type { DateRange } from "@shared/schemas/common";
import { statsBucketFor, type DashboardSummary, type EmployeeHome, type StatsFilters, type StatsPeriod, type StatsReport } from "@shared/schemas/reports";
import { pool } from "../../db/pool";
import { todayInGuatemala } from "../../lib/dates";
import * as reportsRepository from "./reports.repository";

// Todo se calcula en la base con consultas agregadas (RNF 4.1): la pantalla recibe los
// totales listos y nunca la lista completa de ventas. Los días son de Guatemala y "hoy"
// lo decide el reloj del servidor (RNF 3.2).

/** Dashboard del Administrador: ventas del día y del mes, comisiones, gastos y facturas. */
export async function getDashboard(): Promise<DashboardSummary> {
  const today = todayInGuatemala();
  const month = { from: monthStart(today), to: today };
  const previousMonthToDate = sameDaysOfPreviousMonth(today);
  const previousMonth = { from: previousMonthToDate.from, to: monthEnd(previousMonthToDate.from) };

  const [sales, commissions, expenses, invoices, currentSellers, previousSellers, dailySeries, recentSales] = await Promise.all([
    reportsRepository.findSalesSnapshot(pool, { today, month, previousMonth: previousMonthToDate }),
    reportsRepository.findCommissionSnapshot(pool, month),
    reportsRepository.findExpenses(pool, month),
    reportsRepository.findInvoiceUsage(pool, month),
    reportsRepository.findBySeller(pool, month),
    reportsRepository.findBySeller(pool, previousMonth),
    reportsRepository.findSeries(pool, month, "day"),
    reportsRepository.findRecentSales(pool, 5),
  ]);

  return {
    today,
    todaySales: sales.today,
    monthSales: sales.month,
    previousMonthSales: sales.previousMonth,
    commissions,
    expenses: { total: expenses.total, count: expenses.count },
    invoices,
    sellers: { currentMonth: currentSellers, previousMonth: previousSellers },
    dailySeries,
    recentSales,
  };
}

/** Estadísticas por período con filtros y, si se pide, el período de comparación (RF 4.1 a 4.5). */
export async function getStats(filters: StatsFilters): Promise<StatsReport> {
  const { compareFrom, compareTo, ...itemFilters } = filters;
  const bucket = statsBucketFor(itemFilters);

  const [current, previous, activeWorkshopOrders] = await Promise.all([
    loadPeriod(itemFilters, bucket),
    compareFrom && compareTo ? loadPeriod({ ...itemFilters, from: compareFrom, to: compareTo }, bucket) : null,
    reportsRepository.countActiveWorkshopOrders(pool),
  ]);
  return { bucket, current, previous, activeWorkshopOrders };
}

/** Inicio del Empleado: ventas de hoy, tablero de taller y aviso de facturas, sin montos. */
export async function getEmployeeHome(): Promise<EmployeeHome> {
  const today = todayInGuatemala();
  const [sales, workshop, invoices] = await Promise.all([
    reportsRepository.findSalesOfDayWithoutAmounts(pool, today),
    reportsRepository.findWorkshopBoard(pool),
    reportsRepository.findInvoiceUsage(pool, { from: monthStart(today), to: today }),
  ]);
  return {
    today,
    sales,
    workshop,
    invoiceAlert: invoices.issued * 100 >= invoices.limit * invoices.alertPercent,
  };
}

// ─── reglas internas ────────────────────────────────────────────────────────

async function loadPeriod(filters: reportsRepository.ItemFilters, bucket: StatsReport["bucket"]): Promise<StatsPeriod> {
  const range = { from: filters.from, to: filters.to };
  const [totals, series, byPaymentMethod, bySeller, byCategory, byOrigin, expenses, workshop] = await Promise.all([
    reportsRepository.findTotals(pool, filters),
    reportsRepository.findSeries(pool, filters, bucket),
    reportsRepository.findByPaymentMethod(pool, filters),
    reportsRepository.findBySeller(pool, filters),
    reportsRepository.findByCategory(pool, filters),
    reportsRepository.findByOrigin(pool, filters),
    // Los gastos no tienen vendedor, método de pago ni categoría de producto: solo se filtran por fecha
    reportsRepository.findExpenses(pool, range),
    reportsRepository.findWorkshopActivity(pool, range),
  ]);
  return { range, totals, series, byPaymentMethod, bySeller, byCategory, byOrigin, expenses, workshop };
}

// Fechas como texto AAAA-MM-DD: se calculan en UTC solo para sumar días sin que el
// horario de la computadora del servidor las mueva.
const parseDay = (day: string) => new Date(`${day}T00:00:00Z`);
const formatDay = (date: Date) => date.toISOString().slice(0, 10);

const monthStart = (day: string) => `${day.slice(0, 7)}-01`;

function monthEnd(day: string): string {
  const date = parseDay(monthStart(day));
  return formatDay(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)));
}

/** Del 1 del mes anterior al mismo día de hoy (o al último día, si ese mes es más corto). */
function sameDaysOfPreviousMonth(today: string): DateRange {
  const date = parseDay(today);
  const from = formatDay(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1)));
  const lastDay = monthEnd(from);
  const sameDay = `${from.slice(0, 8)}${today.slice(8, 10)}`;
  return { from, to: sameDay < lastDay ? sameDay : lastDay };
}
