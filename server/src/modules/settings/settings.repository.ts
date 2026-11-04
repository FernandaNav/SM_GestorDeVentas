import type { Category } from "@shared/schemas/categories";
import type { Settings, SettingsInput } from "@shared/schemas/settings";
import type { Queryable } from "../../db/pool";

const COLUMNS = `company_name AS "companyName", tax_id AS "taxId", address, phone,
  monthly_invoice_limit AS "monthlyInvoiceLimit", invoice_alert_percent AS "invoiceAlertPercent"`;

const CATEGORY_COLUMNS = `id, name, default_commission_rate AS "defaultCommissionRate", is_active AS "isActive"`;

export async function find(db: Queryable): Promise<Settings> {
  const { rows } = await db.query<Settings>(`SELECT ${COLUMNS} FROM settings WHERE id = 1`);
  return rows[0];
}

export async function update(db: Queryable, input: SettingsInput): Promise<Settings> {
  const { rows } = await db.query<Settings>(
    `UPDATE settings SET company_name = $1, tax_id = $2, address = $3, phone = $4,
       monthly_invoice_limit = $5, invoice_alert_percent = $6
     WHERE id = 1 RETURNING ${COLUMNS}`,
    [
      input.companyName,
      input.taxId.toUpperCase(),
      input.address,
      input.phone ?? null,
      input.monthlyInvoiceLimit,
      input.invoiceAlertPercent,
    ],
  );
  return rows[0];
}

export async function findCategory(db: Queryable, id: number): Promise<Category | undefined> {
  const { rows } = await db.query<Category>(`SELECT ${CATEGORY_COLUMNS} FROM categories WHERE id = $1`, [id]);
  return rows[0];
}

export async function updateCategoryCommission(db: Queryable, id: number, rate: number | null): Promise<Category> {
  const { rows } = await db.query<Category>(
    `UPDATE categories SET default_commission_rate = $2 WHERE id = $1 RETURNING ${CATEGORY_COLUMNS}`,
    [id, rate],
  );
  return rows[0];
}
export async function findCategoryByName(db: Queryable, name: string): Promise<Category | undefined> {
  const { rows } = await db.query<Category>(`SELECT ${CATEGORY_COLUMNS} FROM categories WHERE lower(name) = lower($1)`, [name]);
  return rows[0];
}

/** Inserta la categoría antes de "Otro", para que esa siga siendo la última opción de la lista. */
export async function insertCategory(db: Queryable, name: string, rate: number | null): Promise<Category> {
  const { rows: other } = await db.query<{ sortOrder: number }>(
    `SELECT sort_order AS "sortOrder" FROM categories WHERE lower(name) = 'otro'`,
  );
  let sortOrder: number;
  if (other[0]) {
    sortOrder = other[0].sortOrder;
    await db.query(`UPDATE categories SET sort_order = sort_order + 1 WHERE sort_order >= $1`, [sortOrder]);
  } else {
    const { rows } = await db.query<{ next: number }>(`SELECT coalesce(max(sort_order), 0) + 1 AS next FROM categories`);
    sortOrder = rows[0].next;
  }
  const { rows } = await db.query<Category>(
    `INSERT INTO categories (name, default_commission_rate, sort_order) VALUES ($1, $2, $3) RETURNING ${CATEGORY_COLUMNS}`,
    [name, rate, sortOrder],
  );
  return rows[0];
}

export async function setCategoryActive(db: Queryable, id: number, isActive: boolean): Promise<Category> {
  const { rows } = await db.query<Category>(`UPDATE categories SET is_active = $2 WHERE id = $1 RETURNING ${CATEGORY_COLUMNS}`, [
    id,
    isActive,
  ]);
  return rows[0];
}

export async function countActiveCategories(db: Queryable): Promise<number> {
  const { rows } = await db.query<{ total: number }>(`SELECT count(*)::int AS total FROM categories WHERE is_active`);
  return rows[0].total;
}

/** Órdenes de taller sin cobrar que tienen artículos de esta categoría. */
export async function countOpenOrdersUsingCategory(db: Queryable, categoryId: number): Promise<number> {
  const { rows } = await db.query<{ total: number }>(
    `SELECT count(DISTINCT o.id)::int AS total
     FROM workshop_order_items i
     JOIN workshop_orders o ON o.id = i.order_id
     WHERE i.category_id = $1 AND o.status <> 'Entregada'`,
    [categoryId],
  );
  return rows[0].total;
}
