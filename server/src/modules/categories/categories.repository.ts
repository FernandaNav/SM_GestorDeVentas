import type { Category } from "@shared/schemas/categories";
import type { Queryable } from "../../db/pool";

const COLUMNS = `id, name, default_commission_rate AS "defaultCommissionRate", is_active AS "isActive"`;

export async function findAll(db: Queryable, { onlyActive }: { onlyActive: boolean }): Promise<Category[]> {
  const { rows } = await db.query<Category>(
    `SELECT ${COLUMNS} FROM categories WHERE ($1 = false OR is_active) ORDER BY sort_order, name`,
    [onlyActive],
  );
  return rows;
}

export async function findByIds(db: Queryable, ids: number[]): Promise<Category[]> {
  const { rows } = await db.query<Category>(`SELECT ${COLUMNS} FROM categories WHERE id = ANY($1)`, [ids]);
  return rows;
}
