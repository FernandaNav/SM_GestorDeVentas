// Crea (o reinicia) las dos cuentas de acceso: Administrador y Empleado.
// Uso: pnpm db:seed-users
import type { Role } from "@shared/constants";
import { pool } from "../db/pool";
import { upsertUser } from "../modules/auth/auth.repository";
import { hashPassword } from "../modules/auth/auth.service";
import { askNewPassword } from "./prompt";

const ACCOUNTS: { role: Role; username: string }[] = [
  { role: "Administrador", username: "admin" },
  { role: "Empleado", username: "empleado" },
];

async function main() {
  for (const { role, username } of ACCOUNTS) {
    const password = await askNewPassword(role);
    await upsertUser(pool, role, username, await hashPassword(password));
    console.log(`Cuenta ${role} lista.\n`);
  }
}

main()
  .catch((error) => {
    console.error("Error:", error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
