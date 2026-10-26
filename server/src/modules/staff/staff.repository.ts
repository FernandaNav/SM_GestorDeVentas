import type { StaffFilters, StaffInput, StaffMember } from "@shared/schemas/staff";
import type { Queryable } from "../../db/pool";

const COLUMNS = `id, full_name AS "fullName", type, phone, is_active AS "isActive"`;

export async function findAll(db: Queryable, filters: StaffFilters): Promise<StaffMember[]> {
  const { rows } = await db.query<StaffMember>(
    `SELECT ${COLUMNS} FROM staff
     WHERE ($1::text IS NULL OR type = $1)
       AND ($2::boolean IS NULL OR is_active = $2)
     ORDER BY is_active DESC, full_name`,
    [filters.type ?? null, filters.active ?? null],
  );
  return rows;
}

export async function findById(db: Queryable, id: number): Promise<StaffMember | undefined> {
  const { rows } = await db.query<StaffMember>(`SELECT ${COLUMNS} FROM staff WHERE id = $1`, [id]);
  return rows[0];
}

export async function insert(db: Queryable, input: StaffInput): Promise<StaffMember> {
  const { rows } = await db.query<StaffMember>(
    `INSERT INTO staff (full_name, type, phone) VALUES ($1, $2, $3) RETURNING ${COLUMNS}`,
    [input.fullName, input.type, input.phone ?? null],
  );
  return rows[0];
}

export async function update(db: Queryable, id: number, input: StaffInput): Promise<StaffMember | undefined> {
  const { rows } = await db.query<StaffMember>(
    `UPDATE staff SET full_name = $2, type = $3, phone = $4 WHERE id = $1 RETURNING ${COLUMNS}`,
    [id, input.fullName, input.type, input.phone ?? null],
  );
  return rows[0];
}

export async function setActive(db: Queryable, id: number, isActive: boolean): Promise<StaffMember | undefined> {
  const { rows } = await db.query<StaffMember>(`UPDATE staff SET is_active = $2 WHERE id = $1 RETURNING ${COLUMNS}`, [
    id,
    isActive,
  ]);
  return rows[0];
}
