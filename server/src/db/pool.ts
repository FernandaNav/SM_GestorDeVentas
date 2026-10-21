import pg from "pg";
import { env } from "../config/env";

// NUMERIC llega como string para no perder precisión; los montos de esta app caben
// de sobra en un number, así que se convierten al leer.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (value) => Number(value));
// INT8 (bigserial, COUNT) también llega como string.
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => Number(value));

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  ssl: env.DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false },
  max: 10,
});

/** Cliente o pool: los repositorios aceptan cualquiera para poder usarse dentro de una transacción. */
export type Queryable = pg.Pool | pg.PoolClient;

/** Ejecuta `work` en una transacción: si algo falla, no queda nada guardado a medias. */
export async function withTransaction<T>(work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
