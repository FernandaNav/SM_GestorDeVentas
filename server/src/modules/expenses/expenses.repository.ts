import type { DateRange } from "@shared/schemas/common";
import type { Expense, ExpenseInput } from "@shared/schemas/expenses";
import type { Queryable } from "../../db/pool";

const COLUMNS = `id, to_char(spent_on, 'YYYY-MM-DD') AS "spentOn", amount, category, description`;

export async function findByRange(db: Queryable, range: DateRange): Promise<Expense[]> {
  const { rows } = await db.query<Expense>(
    `SELECT ${COLUMNS} FROM expenses WHERE spent_on BETWEEN $1 AND $2 ORDER BY spent_on DESC, id DESC`,
    [range.from, range.to],
  );
  return rows;
}

export async function findById(db: Queryable, id: number): Promise<Expense | undefined> {
  const { rows } = await db.query<Expense>(`SELECT ${COLUMNS} FROM expenses WHERE id = $1`, [id]);
  return rows[0];
}

export async function insert(db: Queryable, input: ExpenseInput, createdBy: number): Promise<Expense> {
  const { rows } = await db.query<Expense>(
    `INSERT INTO expenses (spent_on, amount, category, description, created_by)
     VALUES ($1, $2, $3, $4, $5) RETURNING ${COLUMNS}`,
    [input.spentOn, input.amount, input.category, input.description, createdBy],
  );
  return rows[0];
}

export async function remove(db: Queryable, id: number): Promise<void> {
  await db.query(`DELETE FROM expenses WHERE id = $1`, [id]);
}