import type { Role } from "@shared/constants";
import type { SessionUser } from "@shared/schemas/auth";
import type { Queryable } from "../../db/pool";

type UserRow = SessionUser & { passwordHash: string };

const USER_COLUMNS = `id, username, role, password_hash AS "passwordHash"`;

export async function findUserByRole(db: Queryable, role: Role): Promise<UserRow | undefined> {
  const { rows } = await db.query<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE role = $1`, [role]);
  return rows[0];
}

export async function findUserById(db: Queryable, id: number): Promise<SessionUser | undefined> {
  const { rows } = await db.query<SessionUser>("SELECT id, username, role FROM users WHERE id = $1", [id]);
  return rows[0];
}

/** Crea la cuenta del rol o, si ya existe, le cambia la contraseña. */
export async function upsertUser(db: Queryable, role: Role, username: string, passwordHash: string) {
  await db.query(
    `INSERT INTO users (username, role, password_hash) VALUES ($1, $2, $3)
     ON CONFLICT (role) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
    [username, role, passwordHash],
  );
}

export async function updatePasswordHash(db: Queryable, role: Role, passwordHash: string): Promise<number | undefined> {
  const { rows } = await db.query<{ id: number }>(
    "UPDATE users SET password_hash = $2 WHERE role = $1 RETURNING id",
    [role, passwordHash],
  );
  return rows[0]?.id;
}
