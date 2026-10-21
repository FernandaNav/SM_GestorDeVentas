// Aplica en orden los archivos de server/db/migrations que todavía no se han aplicado.
// Uso: pnpm db:migrate
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pool, withTransaction } from "../db/pool";

const MIGRATIONS_DIR = path.resolve(process.cwd(), "server/db/migrations");

async function main() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const { rows } = await pool.query<{ name: string }>("SELECT name FROM schema_migrations");
  const applied = new Set(rows.map((row) => row.name));
  const files = (await readdir(MIGRATIONS_DIR)).filter((file) => file.endsWith(".sql")).sort();
  const pending = files.filter((file) => !applied.has(file));

  if (pending.length === 0) {
    console.log("La base de datos ya está al día.");
    return;
  }

  for (const file of pending) {
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
    await withTransaction(async (client) => {
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
    });
    console.log(`Aplicada: ${file}`);
  }
}

main()
  .catch((error) => {
    console.error("Error al migrar:", error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
