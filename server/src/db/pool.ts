import pg from "pg";
import { env } from "../config/env";

// NUMERIC llega como string para no perder precisión; los montos de esta app caben
// de sobra en un number, así que se convierten al leer.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (value) => Number(value));
// INT8 (bigserial, COUNT) también llega como string.
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => Number(value));

// El Session pooler de Supabase admite 15 conexiones entre todos los servidores conectados
// (error EMAXCONNSESSION). Las consultas que no alcanzan conexión esperan en fila, así que
// un máximo bajo solo las hace esperar un momento; y las inactivas se sueltan rápido para
// no ocupar lugar entre una recarga automática y la siguiente.
export const MAX_DB_CONNECTIONS = 4;

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  ssl: env.DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false },
  max: MAX_DB_CONNECTIONS,
  idleTimeoutMillis: 5_000,
});

// Sin esto, que la base cierre una conexión inactiva tumbaría todo el servidor
pool.on("error", (error) => console.error("Conexión inactiva a la base perdida:", error.message));

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
