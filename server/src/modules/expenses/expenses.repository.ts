import type { ExpenseArea } from "@shared/constants";
import type { DateRange } from "@shared/schemas/common";
import type { Expense, ExpenseInput, ExpenseList } from "@shared/schemas/expenses";
import type { Queryable } from "../../db/pool";

const COLUMNS = `id, to_char(spent_on, 'YYYY-MM-DD') AS "spentOn", amount, area, category, description`;

// El área es opcional: NULL = las dos
const WHERE_RANGE_AND_AREA = `spent_on BETWEEN $1 AND $2 AND ($3::text IS NULL OR area = $3)`;

export async function count(db: Queryable, range: DateRange, area: ExpenseArea | null): Promise<number> {
  const { rows } = await db.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM expenses WHERE ${WHERE_RANGE_AND_AREA}`,
    [range.from, range.to, area],
  );
  return rows[0].count;
}

/** Una página. El orden incluye el id para que ningún gasto se repita ni se salte entre páginas. */
export async function findPage(
  db: Queryable,
  range: DateRange,
  area: ExpenseArea | null,
  limit: number,
  offset: number,
): Promise<Expense[]> {
  const { rows } = await db.query<Expense>(
    `SELECT ${COLUMNS} FROM expenses WHERE ${WHERE_RANGE_AND_AREA}
     ORDER BY spent_on DESC, id DESC
     LIMIT $4 OFFSET $5`,
    [range.from, range.to, area, limit, offset],
  );
  return rows;
}

/** Totales del rango completo, por área (sin importar el filtro ni la página). */
export async function summarize(db: Queryable, range: DateRange): Promise<ExpenseList["summary"]> {
  const { rows } = await db.query<{ total: number; tienda: number; taller: number }>(
    `SELECT coalesce(sum(amount), 0) AS total,
            coalesce(sum(amount) FILTER (WHERE area = 'Tienda'), 0) AS tienda,
            coalesce(sum(amount) FILTER (WHERE area = 'Taller'), 0) AS taller
     FROM expenses WHERE spent_on BETWEEN $1 AND $2`,
    [range.from, range.to],
  );
  const { total, tienda, taller } = rows[0];
  return { total, byArea: { Tienda: tienda, Taller: taller } };
}

export async function findById(db: Queryable, id: number): Promise<Expense | undefined> {
  const { rows } = await db.query<Expense>(`SELECT ${COLUMNS} FROM expenses WHERE id = $1`, [id]);
  return rows[0];
}

export async function insert(db: Queryable, input: ExpenseInput, createdBy: number): Promise<Expense> {
  const { rows } = await db.query<Expense>(
    `INSERT INTO expenses (spent_on, amount, area, category, description, created_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${COLUMNS}`,
    [input.spentOn, input.amount, input.area, input.category, input.description, createdBy],
  );
  return rows[0];
}

export async function update(db: Queryable, id: number, input: ExpenseInput): Promise<Expense> {
  const { rows } = await db.query<Expense>(
    `UPDATE expenses SET spent_on = $2, amount = $3, area = $4, category = $5, description = $6
     WHERE id = $1 RETURNING ${COLUMNS}`,
    [id, input.spentOn, input.amount, input.area, input.category, input.description],
  );
  return rows[0];
}

export async function remove(db: Queryable, id: number): Promise<void> {
  await db.query(`DELETE FROM expenses WHERE id = $1`, [id]);
}