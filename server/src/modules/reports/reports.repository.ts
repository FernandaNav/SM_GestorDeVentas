import type { PaymentMethod } from "@shared/constants";
import type { DateRange } from "@shared/schemas/common";
import type {
  CategoryBreakdown,
  EmployeeHome,
  ExpenseBreakdown,
  OriginBreakdown,
  PaymentBreakdown,
  RecentSale,
  SalesTotals,
  SellerBreakdown,
  SeriesPoint,
  StatsBucket,
} from "@shared/schemas/reports";
import type { Queryable } from "../../db/pool";
import { betweenBusinessDays } from "../../lib/dates";

// Los reportes suman artículos (sale_items) y no sales.total: así el filtro por categoría
// cuenta solo lo vendido de esa categoría, y sin filtro el resultado es el mismo.

export type ItemFilters = DateRange & { paymentMethod?: PaymentMethod; sellerId?: number; categoryId?: number };

/** FROM + WHERE comunes; los parámetros $1 a $5 son siempre los de itemParams(). */
const filteredItems = (extraJoins = "") => `
  FROM sales s
  JOIN sale_items i ON i.sale_id = s.id
  ${extraJoins}
  WHERE ${betweenBusinessDays("s.sold_at", "$1", "$2")}
    AND ($3::text IS NULL OR s.payment_method = $3)
    AND ($4::int IS NULL OR s.seller_id = $4)
    AND ($5::int IS NULL OR i.category_id = $5)`;

const itemParams = (f: ItemFilters) => [f.from, f.to, f.paymentMethod ?? null, f.sellerId ?? null, f.categoryId ?? null];

export async function findTotals(db: Queryable, filters: ItemFilters): Promise<SalesTotals> {
  const { rows } = await db.query<SalesTotals>(
    `SELECT coalesce(sum(i.subtotal), 0) AS total,
            count(DISTINCT s.id) AS "salesCount",
            coalesce(round(sum(i.subtotal) / nullif(count(DISTINCT s.id), 0), 2), 0) AS "averageTicket",
            count(DISTINCT s.id) FILTER (WHERE s.is_invoiced) AS "invoicedCount",
            coalesce(sum(i.commission_amount), 0) AS "commissionTotal",
            count(*) FILTER (WHERE i.commission_rate IS NULL) AS "pendingItems"
     ${filteredItems()}`,
    itemParams(filters),
  );
  return rows[0];
}

const BUCKET_LABEL: Record<StatsBucket, string> = {
  hour: `YYYY-MM-DD"T"HH24`,
  day: "YYYY-MM-DD",
  month: "YYYY-MM",
};

/**
 * Ventas y gastos agrupados por hora, día o mes en hora de Guatemala. Incluye los
 * períodos sin movimiento (en cero) para que la gráfica no salte días.
 */
export async function findSeries(db: Queryable, filters: ItemFilters, bucket: StatsBucket): Promise<SeriesPoint[]> {
  const { rows } = await db.query<SeriesPoint>(
    `WITH buckets AS (
       SELECT generate_series(
                date_trunc($6, $1::date::timestamp),
                ($2::date + 1)::timestamp - interval '1 second',
                ('1 ' || $6)::interval
              ) AS bucket
     ),
     sales_by_bucket AS (
       SELECT date_trunc($6, s.sold_at AT TIME ZONE 'America/Guatemala') AS bucket,
              sum(i.subtotal) AS total,
              count(DISTINCT s.id) AS sales_count
       ${filteredItems()}
       GROUP BY 1
     ),
     expenses_by_bucket AS (
       SELECT date_trunc($6, e.spent_on::timestamp) AS bucket, sum(e.amount) AS total
       FROM expenses e
       WHERE e.spent_on BETWEEN $1::date AND $2::date
       GROUP BY 1
     )
     SELECT to_char(b.bucket, $7) AS bucket,
            coalesce(sb.total, 0) AS sales,
            coalesce(sb.sales_count, 0) AS "salesCount",
            coalesce(eb.total, 0) AS expenses
     FROM buckets b
     LEFT JOIN sales_by_bucket sb ON sb.bucket = b.bucket
     LEFT JOIN expenses_by_bucket eb ON eb.bucket = b.bucket
     ORDER BY b.bucket`,
    [...itemParams(filters), bucket, BUCKET_LABEL[bucket]],
  );
  return rows;
}

export async function findByPaymentMethod(db: Queryable, filters: ItemFilters): Promise<PaymentBreakdown[]> {
  const { rows } = await db.query<PaymentBreakdown>(
    `SELECT s.payment_method AS "paymentMethod", sum(i.subtotal) AS total, count(DISTINCT s.id) AS "salesCount"
     ${filteredItems()}
     GROUP BY s.payment_method
     ORDER BY total DESC`,
    itemParams(filters),
  );
  return rows;
}

export async function findBySeller(db: Queryable, filters: ItemFilters): Promise<SellerBreakdown[]> {
  const { rows } = await db.query<SellerBreakdown>(
    `SELECT s.seller_id AS "sellerId", st.full_name AS "sellerName", sum(i.subtotal) AS total,
            count(DISTINCT s.id) AS "salesCount", coalesce(sum(i.commission_amount), 0) AS "commissionTotal"
     ${filteredItems("JOIN staff st ON st.id = s.seller_id")}
     GROUP BY s.seller_id, st.full_name
     ORDER BY total DESC, st.full_name`,
    itemParams(filters),
  );
  return rows;
}

export async function findByCategory(db: Queryable, filters: ItemFilters): Promise<CategoryBreakdown[]> {
  const { rows } = await db.query<CategoryBreakdown>(
    `SELECT c.id AS "categoryId", c.name AS "categoryName", sum(i.subtotal) AS total, sum(i.quantity) AS quantity
     ${filteredItems("JOIN categories c ON c.id = i.category_id")}
     GROUP BY c.id, c.name
     ORDER BY total DESC, c.name`,
    itemParams(filters),
  );
  return rows;
}

export async function findByOrigin(db: Queryable, filters: ItemFilters): Promise<OriginBreakdown[]> {
  const { rows } = await db.query<OriginBreakdown>(
    `SELECT i.origin, sum(i.subtotal) AS total, sum(i.quantity) AS quantity
     ${filteredItems()}
     GROUP BY i.origin
     ORDER BY total DESC`,
    itemParams(filters),
  );
  return rows;
}

export async function findExpenses(
  db: Queryable,
  range: DateRange,
): Promise<{ total: number; count: number; byCategory: ExpenseBreakdown[] }> {
  const { rows } = await db.query<ExpenseBreakdown>(
    `SELECT category, sum(amount) AS total, count(*) AS count
     FROM expenses
     WHERE spent_on BETWEEN $1::date AND $2::date
     GROUP BY category
     ORDER BY total DESC`,
    [range.from, range.to],
  );
  const total = Math.round(rows.reduce((sum, row) => sum + row.total * 100, 0)) / 100;
  return { total, count: rows.reduce((sum, row) => sum + row.count, 0), byCategory: rows };
}

export async function findWorkshopActivity(db: Queryable, range: DateRange): Promise<{ ordersReceived: number; ordersDelivered: number }> {
  const { rows } = await db.query<{ ordersReceived: number; ordersDelivered: number }>(
    `SELECT count(*) FILTER (WHERE ${betweenBusinessDays("received_at", "$1", "$2")}) AS "ordersReceived",
            count(*) FILTER (WHERE ${betweenBusinessDays("delivered_at", "$1", "$2")}) AS "ordersDelivered"
     FROM workshop_orders`,
    [range.from, range.to],
  );
  return rows[0];
}

export async function countActiveWorkshopOrders(db: Queryable): Promise<number> {
  const { rows } = await db.query<{ count: number }>(`SELECT count(*) AS count FROM workshop_orders WHERE status <> 'Entregada'`);
  return rows[0].count;
}

// ─── dashboard ──────────────────────────────────────────────────────────────

type SalesCount = { total: number; count: number };

/** Ventas de hoy, del mes a la fecha y del mes anterior hasta el mismo día, en una sola consulta. */
export async function findSalesSnapshot(
  db: Queryable,
  { today, month, previousMonth }: { today: string; month: DateRange; previousMonth: DateRange },
): Promise<{ today: SalesCount; month: SalesCount; previousMonth: SalesCount }> {
  const { rows } = await db.query<Record<string, number>>(
    `SELECT coalesce(sum(total) FILTER (WHERE ${betweenBusinessDays("sold_at", "$1", "$1")}), 0) AS today_total,
            count(*) FILTER (WHERE ${betweenBusinessDays("sold_at", "$1", "$1")}) AS today_count,
            coalesce(sum(total) FILTER (WHERE ${betweenBusinessDays("sold_at", "$2", "$1")}), 0) AS month_total,
            count(*) FILTER (WHERE ${betweenBusinessDays("sold_at", "$2", "$1")}) AS month_count,
            coalesce(sum(total) FILTER (WHERE ${betweenBusinessDays("sold_at", "$3", "$4")}), 0) AS prev_total,
            count(*) FILTER (WHERE ${betweenBusinessDays("sold_at", "$3", "$4")}) AS prev_count
     FROM sales
     WHERE ${betweenBusinessDays("sold_at", "$3", "$1")}`,
    [today, month.from, previousMonth.from, previousMonth.to],
  );
  const row = rows[0];
  return {
    today: { total: row.today_total, count: row.today_count },
    month: { total: row.month_total, count: row.month_count },
    previousMonth: { total: row.prev_total, count: row.prev_count },
  };
}

export async function findCommissionSnapshot(
  db: Queryable,
  range: DateRange,
): Promise<{ total: number; pendingItems: number; pendingSales: number }> {
  const { rows } = await db.query<{ total: number; pendingItems: number; pendingSales: number }>(
    `SELECT coalesce(sum(i.commission_amount), 0) AS total,
            count(*) FILTER (WHERE i.commission_rate IS NULL) AS "pendingItems",
            count(DISTINCT s.id) FILTER (WHERE i.commission_rate IS NULL) AS "pendingSales"
     FROM sales s
     JOIN sale_items i ON i.sale_id = s.id
     WHERE ${betweenBusinessDays("s.sold_at", "$1", "$2")}`,
    [range.from, range.to],
  );
  return rows[0];
}

export async function findInvoiceUsage(db: Queryable, range: DateRange): Promise<{ issued: number; limit: number; alertPercent: number }> {
  const { rows } = await db.query<{ issued: number; limit: number; alertPercent: number }>(
    `SELECT (SELECT count(*) FROM sales WHERE is_invoiced AND ${betweenBusinessDays("sold_at", "$1", "$2")}) AS issued,
            coalesce(st.monthly_invoice_limit, 200) AS "limit",
            coalesce(st.invoice_alert_percent, 80) AS "alertPercent"
     FROM (SELECT 1) AS one
     LEFT JOIN settings st ON st.id = 1`,
    [range.from, range.to],
  );
  return rows[0];
}

const SALE_LIST_COLUMNS = `
  s.id,
  s.sold_at AS "soldAt",
  st.full_name AS "sellerName",
  s.payment_method AS "paymentMethod",
  s.is_invoiced AS "isInvoiced",
  (SELECT string_agg(i.description, ', ' ORDER BY i.id) FROM sale_items i WHERE i.sale_id = s.id) AS "itemsSummary"`;

export async function findRecentSales(db: Queryable, limit: number): Promise<RecentSale[]> {
  const { rows } = await db.query<RecentSale>(
    `SELECT ${SALE_LIST_COLUMNS}, s.total
     FROM sales s
     JOIN staff st ON st.id = s.seller_id
     ORDER BY s.sold_at DESC, s.id DESC
     LIMIT $1`,
    [limit],
  );
  return rows;
}

// ─── inicio del empleado ────────────────────────────────────────────────────

/** Ventas del día sin el total: el empleado no recibe montos (RNF 1.3). */
export async function findSalesOfDayWithoutAmounts(db: Queryable, day: string): Promise<EmployeeHome["sales"]> {
  const { rows } = await db.query<EmployeeHome["sales"][number]>(
    `SELECT ${SALE_LIST_COLUMNS}
     FROM sales s
     JOIN staff st ON st.id = s.seller_id
     WHERE ${betweenBusinessDays("s.sold_at", "$1", "$1")}
     ORDER BY s.sold_at DESC, s.id DESC`,
    [day],
  );
  return rows;
}

export async function findWorkshopBoard(db: Queryable): Promise<EmployeeHome["workshop"]> {
  const [{ rows: counts }, { rows: readyOrders }] = await Promise.all([
    db.query<{ received: number; inRepair: number; ready: number }>(
      `SELECT count(*) FILTER (WHERE status = 'Recibida') AS received,
              count(*) FILTER (WHERE status = 'En reparación') AS "inRepair",
              count(*) FILTER (WHERE status = 'Lista para entregar') AS ready
       FROM workshop_orders
       WHERE status <> 'Entregada'`,
    ),
    db.query<EmployeeHome["workshop"]["readyOrders"][number]>(
      `SELECT id, client_name AS "clientName", motorcycle, plate
       FROM workshop_orders
       WHERE status = 'Lista para entregar'
       ORDER BY updated_at`,
    ),
  ]);
  return { ...counts[0], readyOrders };
}
