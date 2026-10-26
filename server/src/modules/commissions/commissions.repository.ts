import type { DateRange } from "@shared/schemas/common";
import type { CommissionFilters, CommissionItem, CommissionSellerSummary } from "@shared/schemas/commissions";
import type { Queryable } from "../../db/pool";
import { betweenBusinessDays } from "../../lib/dates";

/** Totales por vendedor en el rango; incluye a los vendedores activos aunque no hayan vendido. */
export async function findSellerSummaries(db: Queryable, range: DateRange): Promise<CommissionSellerSummary[]> {
  const { rows } = await db.query<CommissionSellerSummary>(
    `WITH items AS (
       SELECT s.seller_id, s.id AS sale_id, i.subtotal, i.commission_rate, i.commission_amount
       FROM sales s
       JOIN sale_items i ON i.sale_id = s.id
       WHERE ${betweenBusinessDays("s.sold_at", "$1", "$2")}
     )
     SELECT st.id AS "sellerId",
            st.full_name AS "sellerName",
            st.is_active AS "isActive",
            count(DISTINCT it.sale_id) AS "salesCount",
            coalesce(sum(it.subtotal), 0) AS "totalSold",
            coalesce(sum(it.commission_amount), 0) AS "commissionTotal",
            count(it.sale_id) FILTER (WHERE it.commission_rate IS NULL) AS "pendingItems",
            coalesce(sum(it.subtotal) FILTER (WHERE it.commission_rate IS NULL), 0) AS "pendingSubtotal"
     FROM staff st
     LEFT JOIN items it ON it.seller_id = st.id
     WHERE st.type = 'Vendedor'
     GROUP BY st.id, st.full_name, st.is_active
     HAVING st.is_active OR count(it.sale_id) > 0
     ORDER BY "totalSold" DESC, st.full_name`,
    [range.from, range.to],
  );
  return rows;
}

const ITEM_COLUMNS = `
  i.id,
  s.id AS "saleId",
  s.sold_at AS "soldAt",
  s.seller_id AS "sellerId",
  st.full_name AS "sellerName",
  s.payment_method AS "paymentMethod",
  i.description,
  c.name AS "categoryName",
  i.quantity,
  i.unit_price AS "unitPrice",
  i.subtotal,
  i.commission_rate AS "commissionRate",
  i.commission_amount AS "commissionAmount",
  EXISTS (
    SELECT 1 FROM closures cl WHERE business_date(s.sold_at) BETWEEN cl.period_start AND cl.period_end
  ) AS "isClosed"`;

const ITEM_FROM = `
  FROM sale_items i
  JOIN sales s ON s.id = i.sale_id
  JOIN staff st ON st.id = s.seller_id
  JOIN categories c ON c.id = i.category_id`;

/** Qué vendió cada vendedor y cuánta comisión generó (RF 3.3). */
export async function findItems(db: Queryable, filters: CommissionFilters): Promise<CommissionItem[]> {
  const { rows } = await db.query<CommissionItem>(
    `SELECT ${ITEM_COLUMNS}
     ${ITEM_FROM}
     WHERE ${betweenBusinessDays("s.sold_at", "$1", "$2")}
       AND ($3::int IS NULL OR s.seller_id = $3)
       AND ($4::boolean = false OR i.commission_rate IS NULL)
     ORDER BY s.sold_at DESC, i.id`,
    [filters.from, filters.to, filters.sellerId ?? null, filters.status === "pendientes"],
  );
  return rows;
}

/** Bloquea los artículos hasta terminar la transacción, para que dos estaciones no los asignen a la vez. */
export async function findItemsByIdsForUpdate(db: Queryable, ids: number[]): Promise<CommissionItem[]> {
  await db.query(`SELECT id FROM sale_items WHERE id = ANY($1) FOR UPDATE`, [ids]);
  const { rows } = await db.query<CommissionItem>(`SELECT ${ITEM_COLUMNS} ${ITEM_FROM} WHERE i.id = ANY($1) ORDER BY i.id`, [ids]);
  return rows;
}

/** Solo toca artículos pendientes; devuelve los ids que sí se actualizaron. */
export async function setPendingRate(db: Queryable, ids: number[], rate: number): Promise<number[]> {
  const { rows } = await db.query<{ id: number }>(
    `UPDATE sale_items SET commission_rate = $2 WHERE id = ANY($1) AND commission_rate IS NULL RETURNING id`,
    [ids, rate],
  );
  return rows.map((row) => row.id);
}

export async function findItemsByIds(db: Queryable, ids: number[]): Promise<CommissionItem[]> {
  const { rows } = await db.query<CommissionItem>(`SELECT ${ITEM_COLUMNS} ${ITEM_FROM} WHERE i.id = ANY($1) ORDER BY i.id`, [ids]);
  return rows;
}
