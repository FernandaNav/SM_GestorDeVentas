import { app } from "./app";
import { env } from "./config/env";
import { pool } from "./db/pool";

async function start() {
  try {
    await pool.query("SELECT 1");
  } catch (error) {
    console.error("No se pudo conectar a la base de datos. Revisa DATABASE_URL en .env");
    console.error((error as Error).message);
    process.exit(1);
  }

  app.listen(env.API_PORT, () => {
    console.log(`API de SoloMotos en http://localhost:${env.API_PORT}`);
  });
}

start();
