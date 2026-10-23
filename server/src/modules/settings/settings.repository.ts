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