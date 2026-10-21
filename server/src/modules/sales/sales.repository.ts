import type { SaleItemOrigin, TaxIdType } from "@shared/constants";
import type { DateRange } from "@shared/schemas/common";
import type { SaleDetail, SaleItem, SaleSummary } from "@shared/schemas/sales";
import type { Queryable } from "../../db/pool";
import { betweenBusinessDays } from "../../lib/dates";

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

export async function findSummaries(db: Queryable, range: DateRange): Promise<Required<SaleSummary>[]> {
  const { rows } = await db.query<Required<SaleSummary>>(
    `SELECT s.id,
            s.sold_at AS "soldAt",
            st.full_name AS "sellerName",
            s.payment_method AS "paymentMethod",
            s.is_invoiced AS "isInvoiced",
            s.client_name AS "clientName",
            s.total,
            string_agg(i.description, ', ' ORDER BY i.id) AS "itemsSummary",
            coalesce(sum(i.commission_amount), 0) AS "commissionAmount",
            bool_or(i.commission_rate IS NULL) AS "hasPendingCommission"
     FROM sales s
     JOIN staff st ON st.id = s.seller_id
     JOIN sale_items i ON i.sale_id = s.id
     WHERE ${betweenBusinessDays("s.sold_at", "$1", "$2")}
     GROUP BY s.id, st.full_name
     ORDER BY s.sold_at DESC`,
    [range.from, range.to],
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

/** Guarda o actualiza el cliente por su NIT/CUI y devuelve su id. */
export async function upsertClient(
  db: Queryable,
  client: { taxIdType: "NIT" | "CUI"; taxId: string; name: string; address: string | null },
): Promise<number> {
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO clients (tax_id_type, tax_id, name, address) VALUES ($1, $2, $3, $4)
     ON CONFLICT (tax_id) DO UPDATE SET name = EXCLUDED.name, address = EXCLUDED.address
     RETURNING id`,
    [client.taxIdType, client.taxId, client.name, client.address],
  );
  return rows[0].id;
}
