import type { SaleItemOrigin, TaxIdType } from "@shared/constants";
import type { DateRange } from "@shared/schemas/common";
import type { DeletedSale, DeletedSaleFilters, SaleDetail, SaleFilters, SaleItem, SaleSummary } from "@shared/schemas/sales";
import type { Queryable } from "../../db/pool";
import { betweenBusinessDays, inClosedPeriod } from "../../lib/dates";

export type NewSaleRow = {
  sellerId: number;
  paymentMethod: string;
  isInvoiced: boolean;
  clientId: number | null;
  client: { taxIdType: TaxIdType; taxId: string; name: string; address: string | null } | null;
  observations: string | null;
  total: number;
  createdBy: number;
};

export type NewSaleItemRow = {
  description: string;
  categoryId: number;
  quantity: number;
  unitPrice: number;
  commissionRate: number | null;
  origin: SaleItemOrigin;
};

export async function insertSale(db: Queryable, sale: NewSaleRow): Promise<number> {
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO sales (seller_id, payment_method, is_invoiced, client_id, client_tax_id_type, client_tax_id,
                        client_name, client_address, observations, total, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id`,
    [
      sale.sellerId,
      sale.paymentMethod,
      sale.isInvoiced,
      sale.clientId,
      sale.client?.taxIdType ?? null,
      sale.client?.taxId ?? null,
      sale.client?.name ?? null,
      sale.client?.address ?? null,
      sale.observations,
      sale.total,
      sale.createdBy,
    ],
  );
  return rows[0].id;
}

export async function insertItems(db: Queryable, saleId: number, items: NewSaleItemRow[]) {
  for (const item of items) {
    await db.query(
      `INSERT INTO sale_items (sale_id, description, category_id, quantity, unit_price, commission_rate, origin)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [saleId, item.description, item.categoryId, item.quantity, item.unitPrice, item.commissionRate, item.origin],
    );
  }
}

/** WHERE y parámetros de los filtros del historial; los comparten la página y el conteo. */
function saleFilterConditions(filters: SaleFilters): { where: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.from && filters.to) {
    params.push(filters.from, filters.to);
    conditions.push(betweenBusinessDays("s.sold_at", `$${params.length - 1}`, `$${params.length}`));
  }

  if (filters.sellerId) {
    params.push(filters.sellerId);
    conditions.push(`s.seller_id = $${params.length}`);
  }

  if (filters.paymentMethod) {
    params.push(filters.paymentMethod);
    conditions.push(`s.payment_method = $${params.length}`);
  }

  if (filters.isInvoiced !== undefined) {
    params.push(filters.isInvoiced);
    conditions.push(`s.is_invoiced = $${params.length}`);
  }

  if (filters.categoryId) {
    params.push(filters.categoryId);
    conditions.push(`EXISTS (SELECT 1 FROM sale_items si WHERE si.sale_id = s.id AND si.category_id = $${params.length})`);
  }

  if (filters.hasPendingCommission) {
    conditions.push(`EXISTS (SELECT 1 FROM sale_items si WHERE si.sale_id = s.id AND si.commission_rate IS NULL)`);
  }

  if (filters.search && filters.search.trim()) {
    params.push(`%${filters.search.trim()}%`);
    const pIdx = params.length;
    conditions.push(`(s.client_name ILIKE $${pIdx} OR st.full_name ILIKE $${pIdx} OR EXISTS (SELECT 1 FROM sale_items si WHERE si.sale_id = s.id AND si.description ILIKE $${pIdx}))`);
  }

  return { where: conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "", params };
}

export async function countSummaries(db: Queryable, filters: SaleFilters): Promise<number> {
  const { where, params } = saleFilterConditions(filters);
  const { rows } = await db.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM sales s JOIN staff st ON st.id = s.seller_id ${where}`,
    params,
  );
  return rows[0].count;
}

/** Una página del historial. El orden incluye el id para que ninguna venta se repita ni se salte entre páginas. */
export async function findSummaryPage(
  db: Queryable,
  filters: SaleFilters,
  limit: number,
  offset: number,
): Promise<Required<SaleSummary>[]> {
  const { where, params } = saleFilterConditions(filters);
  const { rows } = await db.query<Required<SaleSummary>>(
    `SELECT s.id,
            s.sold_at AS "soldAt",
            s.seller_id AS "sellerId",
            st.full_name AS "sellerName",
            s.payment_method AS "paymentMethod",
            s.is_invoiced AS "isInvoiced",
            s.client_name AS "clientName",
            s.total,
            string_agg(i.description, ', ' ORDER BY i.id) AS "itemsSummary",
            coalesce(sum(i.commission_amount), 0) AS "commissionAmount",
            bool_or(i.commission_rate IS NULL) AS "hasPendingCommission",
            ${inClosedPeriod("s.sold_at")} AS "isClosed"
     FROM sales s
     JOIN staff st ON st.id = s.seller_id
     JOIN sale_items i ON i.sale_id = s.id
     ${where}
     GROUP BY s.id, st.full_name
     ORDER BY s.sold_at DESC, s.id DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset],
  );
  return rows;
}


type SaleDetailRow = Omit<SaleDetail, "client" | "items"> & {
  clientTaxIdType: TaxIdType | null;
  clientTaxId: string | null;
  clientName: string | null;
  clientAddress: string | null;
};

export async function findDetail(db: Queryable, id: number): Promise<SaleDetail | undefined> {
  const { rows } = await db.query<SaleDetailRow>(
    `SELECT s.id,
            s.sold_at AS "soldAt",
            s.seller_id AS "sellerId",
            st.full_name AS "sellerName",
            s.payment_method AS "paymentMethod",
            s.is_invoiced AS "isInvoiced",
            s.client_tax_id_type AS "clientTaxIdType",
            s.client_tax_id AS "clientTaxId",
            s.client_name AS "clientName",
            s.client_address AS "clientAddress",
            s.observations,
            s.total
     FROM sales s
     JOIN staff st ON st.id = s.seller_id
     WHERE s.id = $1`,
    [id],
  );
  const row = rows[0];
  if (!row) return undefined;

  const { rows: items } = await db.query<SaleItem>(
    `SELECT i.id, i.description, i.category_id AS "categoryId", c.name AS "categoryName",
            i.quantity, i.unit_price AS "unitPrice", i.subtotal, i.origin,
            i.commission_rate AS "commissionRate", i.commission_amount AS "commissionAmount"
     FROM sale_items i
     JOIN categories c ON c.id = i.category_id
     WHERE i.sale_id = $1
     ORDER BY i.id`,
    [id],
  );

  const { clientTaxIdType, clientTaxId, clientName, clientAddress, ...sale } = row;
  const client =
    clientTaxIdType && clientTaxId && clientName
      ? { taxIdType: clientTaxIdType, taxId: clientTaxId, name: clientName, address: clientAddress }
      : null;
  return { ...sale, client, items };
}

// Compara NIT y CUI sin guiones, espacios ni diferencias de mayúsculas: "5489632-1" y "54896321"
// son el mismo cliente. Coincide con el índice de la migración 005.
const normalizedTaxId = (value: string) => `regexp_replace(upper(${value}), '[^0-9A-Z]', '', 'g')`;

/** Guarda o actualiza el cliente por su NIT/CUI y devuelve su id. */
export async function upsertClient(
  db: Queryable,
  client: { taxIdType: "NIT" | "CUI"; taxId: string; name: string; address: string | null },
): Promise<number> {
  const existing = await findClientByTaxId(db, client.taxId);
  if (existing) {
    await db.query(`UPDATE clients SET name = $2, address = $3 WHERE id = $1`, [existing.id, client.name, client.address]);
    return existing.id;
  }
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO clients (tax_id_type, tax_id, name, address) VALUES ($1, $2, $3, $4)
     ON CONFLICT (tax_id) DO UPDATE SET name = EXCLUDED.name, address = EXCLUDED.address
     RETURNING id`,
    [client.taxIdType, client.taxId, client.name, client.address],
  );
  return rows[0].id;
}

export async function findClientByTaxId(
  db: Queryable,
  taxId: string,
): Promise<import("@shared/schemas/sales").ClientLookup | undefined> {
  const { rows } = await db.query<import("@shared/schemas/sales").ClientLookup>(
    `SELECT id, tax_id_type AS "taxIdType", tax_id AS "taxId", name, address
     FROM clients
     WHERE ${normalizedTaxId("tax_id")} = ${normalizedTaxId("$1")}
     ORDER BY id
     LIMIT 1`,
    [taxId],
  );
  return rows[0];
}

export async function findMonthlyInvoiceUsage(
  db: Queryable,
  monthRange: import("@shared/schemas/common").DateRange,
): Promise<{ issued: number; limit: number; alertPercent: number }> {
  const { rows } = await db.query<{ issued: number; limit: number; alertPercent: number }>(
    `SELECT (SELECT count(*) FROM sales WHERE is_invoiced AND ${betweenBusinessDays("sold_at", "$1", "$2")}) AS issued,
            coalesce(st.monthly_invoice_limit, 200) AS "limit",
            coalesce(st.invoice_alert_percent, 80) AS "alertPercent"
     FROM (SELECT 1) AS one
     LEFT JOIN settings st ON st.id = 1`,
    [monthRange.from, monthRange.to],
  );
  return rows[0];
}

export async function updateSale(db: Queryable, id: number, sale: Omit<NewSaleRow, "createdBy">): Promise<void> {
  await db.query(
    `UPDATE sales
     SET seller_id = $1, payment_method = $2, is_invoiced = $3, client_id = $4,
         client_tax_id_type = $5, client_tax_id = $6, client_name = $7, client_address = $8,
         observations = $9, total = $10, updated_at = now()
     WHERE id = $11`,
    [
      sale.sellerId,
      sale.paymentMethod,
      sale.isInvoiced,
      sale.clientId,
      sale.client?.taxIdType ?? null,
      sale.client?.taxId ?? null,
      sale.client?.name ?? null,
      sale.client?.address ?? null,
      sale.observations,
      sale.total,
      id,
    ],
  );
}

export async function deleteItems(db: Queryable, saleId: number): Promise<void> {
  await db.query(`DELETE FROM sale_items WHERE sale_id = $1`, [saleId]);
}

export async function deleteSale(db: Queryable, id: number): Promise<void> {
  await db.query(`DELETE FROM sales WHERE id = $1`, [id]);
}


// ─── ventas eliminadas ──────────────────────────────────────────────────────

// Se leen de la copia que deja la bitácora al eliminar (before_data), así no hace falta
// conservar la venta en sales y ningún reporte ni cierre tiene que filtrarla.
// $3 = texto a buscar; $4 = el mismo texto como número de venta ("#12" o "12").
const DELETED_WHERE = `
  WHERE a.entity = 'sales' AND a.action = 'eliminar'
    AND ${betweenBusinessDays("a.created_at", "$1", "$2")}
    AND ($3::text IS NULL
      OR a.entity_id = $4
      OR a.before_data->>'sellerName' ILIKE '%' || $3 || '%'
      OR a.before_data->'client'->>'name' ILIKE '%' || $3 || '%'
      OR a.before_data->'client'->>'taxId' ILIKE '%' || $3 || '%'
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(coalesce(a.before_data->'items', '[]'::jsonb)) AS item
        WHERE item->>'description' ILIKE '%' || $3 || '%'
      ))`;

const deletedParams = (filters: DeletedSaleFilters) => {
  const search = filters.search || null;
  return [filters.from, filters.to, search, search?.replace(/^#/, "") ?? null];
};

export async function countDeleted(db: Queryable, filters: DeletedSaleFilters): Promise<number> {
  const { rows } = await db.query<{ total: number }>(`SELECT count(*)::int AS total FROM audit_log a ${DELETED_WHERE}`, deletedParams(filters));
  return rows[0].total;
}

export async function findDeletedPage(db: Queryable, filters: DeletedSaleFilters, limit: number, offset: number): Promise<DeletedSale[]> {
  const { rows } = await db.query<DeletedSale>(
    `SELECT a.id AS "auditId",
            a.entity_id::bigint AS "saleId",
            a.created_at AS "deletedAt",
            a.user_role AS "deletedByRole",
            a.after_data->>'reason' AS reason,
            a.before_data AS sale
     FROM audit_log a
     ${DELETED_WHERE}
     ORDER BY a.created_at DESC, a.id DESC
     LIMIT $5 OFFSET $6`,
    [...deletedParams(filters), limit, offset],
  );
  return rows;
}
