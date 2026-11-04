import type { WorkshopStatus } from "@shared/constants";
import type {
  CreateWorkshopOrderInput,
  WorkshopHistoryFilters,
  WorkshopItemInput,
  WorkshopOrderEvent,
  WorkshopOrderItem,
  WorkshopOrderSummary,
  WorkshopSummary,
} from "@shared/schemas/workshop";
import type { Queryable } from "../../db/pool";

const SUMMARY_COLUMNS = `
  o.id,
  o.client_name AS "clientName",
  o.client_phone AS "clientPhone",
  o.motorcycle,
  o.plate,
  o.work_description AS "workDescription",
  o.mechanic_id AS "mechanicId",
  m.full_name AS "mechanicName",
  o.status,
  o.estimated_cost AS "estimatedCost",
  o.final_cost AS "finalCost",
  coalesce(totals.items_total, 0) AS "itemsTotal",
  coalesce(totals.items_count, 0)::int AS "itemsCount",
  o.sale_id AS "saleId",
  o.received_at AS "receivedAt",
  o.delivered_at AS "deliveredAt"`;

const SUMMARY_FROM = `
  FROM workshop_orders o
  JOIN staff m ON m.id = o.mechanic_id
  LEFT JOIN LATERAL (
    SELECT sum(i.quantity * i.unit_price) AS items_total, count(*) AS items_count
    FROM workshop_order_items i
    WHERE i.order_id = o.id
  ) totals ON true`;

/** Las que siguen en el taller. No se paginan: son el trabajo del día y no se acumulan. */
export async function findActive(db: Queryable): Promise<WorkshopOrderSummary[]> {
  const { rows } = await db.query<WorkshopOrderSummary>(
    `SELECT ${SUMMARY_COLUMNS} ${SUMMARY_FROM} WHERE o.status <> 'Entregada' ORDER BY o.received_at`,
  );
  return rows;
}

// Entregadas que coinciden con la búsqueda. $1 = texto; $2 = el mismo texto como número de
// orden ("OT-0007", "ot7" o "7" → 7), para encontrarla aunque esté en otra página;
// $3 = solo las entregadas ese día (NULL = todas).
const HISTORY_WHERE = `
  WHERE o.status = 'Entregada'
    AND ($3::date IS NULL OR business_date(o.delivered_at) = $3)
    AND ($1::text IS NULL
      OR o.id = $2
      OR o.client_name ILIKE '%' || $1 || '%'
      OR o.motorcycle ILIKE '%' || $1 || '%'
      OR o.plate ILIKE '%' || $1 || '%'
      OR o.client_phone ILIKE '%' || $1 || '%')`;

const historyParams = ({ search }: WorkshopHistoryFilters, deliveredOn: string | null) => {
  const text = search || null;
  const orderNumber = text?.match(/^(?:OT-?)?0*(\d{1,9})$/i)?.[1];
  return [text, orderNumber ? Number(orderNumber) : null, deliveredOn];
};

export async function countHistory(db: Queryable, filters: WorkshopHistoryFilters, deliveredOn: string | null): Promise<number> {
  const { rows } = await db.query<{ total: number }>(
    `SELECT count(*)::int AS total FROM workshop_orders o ${HISTORY_WHERE}`,
    historyParams(filters, deliveredOn),
  );
  return rows[0].total;
}

export async function findHistoryPage(
  db: Queryable,
  filters: WorkshopHistoryFilters,
  deliveredOn: string | null,
  limit: number,
  offset: number,
): Promise<WorkshopOrderSummary[]> {
  const { rows } = await db.query<WorkshopOrderSummary>(
    `SELECT ${SUMMARY_COLUMNS} ${SUMMARY_FROM} ${HISTORY_WHERE} ORDER BY o.delivered_at DESC, o.id DESC LIMIT $4 OFFSET $5`,
    [...historyParams(filters, deliveredOn), limit, offset],
  );
  return rows;
}

/** deliveredTotal cuenta lo que quien consulta puede ver en el historial (deliveredOn = solo ese día). */
export async function findSummaryCounts(db: Queryable, deliveredOn: string | null): Promise<WorkshopSummary> {
  const { rows } = await db.query<WorkshopSummary>(
    `SELECT count(*) FILTER (WHERE business_date(delivered_at) = business_date(now()))::int AS "deliveredToday",
            count(*) FILTER (WHERE $1::date IS NULL OR business_date(delivered_at) = $1)::int AS "deliveredTotal"
     FROM workshop_orders
     WHERE status = 'Entregada'`,
    [deliveredOn],
  );
  return rows[0];
}

/** Con `forUpdate` bloquea la orden hasta terminar la transacción, para que dos estaciones no la cobren a la vez. */
export async function findById(db: Queryable, id: number, { forUpdate = false } = {}): Promise<WorkshopOrderSummary | undefined> {
  if (forUpdate) await db.query(`SELECT id FROM workshop_orders WHERE id = $1 FOR UPDATE`, [id]);
  const { rows } = await db.query<WorkshopOrderSummary>(`SELECT ${SUMMARY_COLUMNS} ${SUMMARY_FROM} WHERE o.id = $1`, [id]);
  return rows[0];
}

export async function findItems(db: Queryable, orderId: number): Promise<WorkshopOrderItem[]> {
  const { rows } = await db.query<WorkshopOrderItem>(
    `SELECT i.id, i.kind, i.description, i.category_id AS "categoryId", c.name AS "categoryName",
            i.quantity, i.unit_price AS "unitPrice", round(i.quantity * i.unit_price, 2) AS subtotal
     FROM workshop_order_items i
     LEFT JOIN categories c ON c.id = i.category_id
     WHERE i.order_id = $1
     ORDER BY i.id`,
    [orderId],
  );
  return rows;
}

export async function findEvents(db: Queryable, orderId: number): Promise<WorkshopOrderEvent[]> {
  const { rows } = await db.query<WorkshopOrderEvent>(
    `SELECT e.id, e.description, u.role AS "createdByRole", e.created_at AS "createdAt"
     FROM workshop_order_events e
     LEFT JOIN users u ON u.id = e.created_by
     WHERE e.order_id = $1
     ORDER BY e.created_at, e.id`,
    [orderId],
  );
  return rows;
}

export async function insertOrder(db: Queryable, input: CreateWorkshopOrderInput): Promise<number> {
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO workshop_orders (client_name, client_phone, motorcycle, plate, work_description, mechanic_id, estimated_cost)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      input.clientName,
      input.clientPhone ?? null,
      input.motorcycle,
      input.plate ?? null,
      input.workDescription,
      input.mechanicId,
      input.estimatedCost ?? null,
    ],
  );
  return rows[0].id;
}

export async function insertItem(db: Queryable, orderId: number, item: WorkshopItemInput): Promise<WorkshopOrderItem> {
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO workshop_order_items (order_id, kind, description, category_id, quantity, unit_price)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [orderId, item.kind, item.description, item.categoryId, item.quantity, item.unitPrice],
  );
  const items = await findItems(db, orderId);
  return items.find((saved) => saved.id === rows[0].id)!;
}

export async function deleteItem(db: Queryable, orderId: number, itemId: number): Promise<WorkshopOrderItem | undefined> {
  const existing = (await findItems(db, orderId)).find((item) => item.id === itemId);
  if (!existing) return undefined;
  await db.query(`DELETE FROM workshop_order_items WHERE id = $1 AND order_id = $2`, [itemId, orderId]);
  return existing;
}

export async function updateStatus(db: Queryable, id: number, status: WorkshopStatus) {
  await db.query(`UPDATE workshop_orders SET status = $2 WHERE id = $1`, [id, status]);
}

export async function markDelivered(db: Queryable, id: number, saleId: number, finalCost: number) {
  await db.query(
    `UPDATE workshop_orders SET status = 'Entregada', sale_id = $2, final_cost = $3, delivered_at = now() WHERE id = $1`,
    [id, saleId, finalCost],
  );
}

/** Actualiza lo cobrado en la orden que generó esta venta. Devuelve su id, o undefined si la venta no viene de taller. */
export async function updateFinalCostBySale(db: Queryable, saleId: number, finalCost: number): Promise<number | undefined> {
  const { rows } = await db.query<{ id: number }>(`UPDATE workshop_orders SET final_cost = $2 WHERE sale_id = $1 RETURNING id`, [
    saleId,
    finalCost,
  ]);
  return rows[0]?.id;
}

/** Deshace el cobro de la orden que generó esta venta. Devuelve su id, o undefined si la venta no viene de taller. */
export async function reopenOrderOfSale(db: Queryable, saleId: number): Promise<number | undefined> {
  const { rows } = await db.query<{ id: number }>(
    `UPDATE workshop_orders
     SET status = 'Lista para entregar', sale_id = NULL, final_cost = NULL, delivered_at = NULL
     WHERE sale_id = $1
     RETURNING id`,
    [saleId],
  );
  return rows[0]?.id;
}

export async function insertEvent(db: Queryable, orderId: number, description: string, createdBy: number) {
  await db.query(`INSERT INTO workshop_order_events (order_id, description, created_by) VALUES ($1, $2, $3)`, [
    orderId,
    description,
    createdBy,
  ]);
}
