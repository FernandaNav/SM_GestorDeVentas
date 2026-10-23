import type { Closure, ClosureTotals } from "@shared/schemas/closures";
import type { Queryable } from "../../db/pool";
import { betweenBusinessDays } from "../../lib/dates";

/**
 * Primer día sin cerrar: el siguiente al último cierre. Si nunca se ha cerrado, el día
 * de la primera venta. Si tampoco hay ventas, null (el servicio usa hoy).
 */
export async function findOpenPeriodStart(db: Queryable): Promise<string | null> {
  const { rows } = await db.query<{ start: string | null }>(
    `SELECT to_char(coalesce(
       (SELECT max(period_end) + 1 FROM closures),
       (SELECT min(business_date(sold_at)) FROM sales)
     ), 'YYYY-MM-DD') AS start`,
  );
  return rows[0].start;
}

export async function calculateTotals(db: Queryable, from: string, to: string): Promise<ClosureTotals> {
  const { rows } = await db.query<ClosureTotals>(
    `WITH period_sales AS (
       SELECT s.id, s.payment_method, s.total,
              EXISTS (SELECT 1 FROM sale_items i WHERE i.sale_id = s.id AND i.commission_rate IS NULL) AS pending
       FROM sales s
       WHERE ${betweenBusinessDays("s.sold_at", "$1", "$2")}
     )
     SELECT count(*)::int AS "salesCount",
            coalesce(sum(total), 0) AS "totalAmount",
            coalesce(sum(total) FILTER (WHERE payment_method = 'Efectivo'), 0) AS "cashAmount",
            count(*) FILTER (WHERE payment_method = 'Efectivo')::int AS "cashCount",
            coalesce(sum(total) FILTER (WHERE payment_method = 'Transferencia'), 0) AS "transferAmount",
            count(*) FILTER (WHERE payment_method = 'Transferencia')::int AS "transferCount",
            coalesce(sum(total) FILTER (WHERE payment_method = 'Tarjeta'), 0) AS "cardAmount",
            count(*) FILTER (WHERE payment_method = 'Tarjeta')::int AS "cardCount",
            count(*) FILTER (WHERE pending)::int AS "pendingCommissionCount"
     FROM period_sales`,
    [from, to],
  );
  return rows[0];
}

const CLOSURE_COLUMNS = `c.id,
  to_char(c.period_start, 'YYYY-MM-DD') AS "periodStart",
  to_char(c.period_end, 'YYYY-MM-DD') AS "periodEnd",
  c.sales_count AS "salesCount", c.total_amount AS "totalAmount", c.cash_amount AS "cashAmount",
  c.transfer_amount AS "transferAmount", c.card_amount AS "cardAmount",
  c.closed_at AS "closedAt", u.role AS "closedBy"`;

export async function findAll(db: Queryable): Promise<Closure[]> {
  const { rows } = await db.query<Closure>(
    `SELECT ${CLOSURE_COLUMNS} FROM closures c JOIN users u ON u.id = c.closed_by ORDER BY c.period_end DESC`,
  );
  return rows;
}

export async function insert(
  db: Queryable,
  closure: { periodStart: string; periodEnd: string; totals: ClosureTotals; closedBy: number },
): Promise<Closure> {
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO closures (period_start, period_end, sales_count, total_amount, cash_amount, transfer_amount, card_amount, closed_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [
      closure.periodStart,
      closure.periodEnd,
      closure.totals.salesCount,
      closure.totals.totalAmount,
      closure.totals.cashAmount,
      closure.totals.transferAmount,
      closure.totals.cardAmount,
      closure.closedBy,
    ],
  );
  const { rows: created } = await db.query<Closure>(
    `SELECT ${CLOSURE_COLUMNS} FROM closures c JOIN users u ON u.id = c.closed_by WHERE c.id = $1`,
    [rows[0].id],
  );
  return created[0];
}