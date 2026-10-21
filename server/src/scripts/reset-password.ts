// Recupera el acceso si se olvidó una contraseña (no hay recuperación por correo).
// Se ejecuta en el servidor, así que solo puede hacerlo quien tiene acceso a él.
// Uso: pnpm db:reset-password
import { ROLES, type Role } from "@shared/constants";
import { pool } from "../db/pool";
import { changePassword } from "../modules/auth/auth.service";
import { ask, askNewPassword } from "./prompt";

async function main() {
  const answer = await ask(`¿Qué cuenta? (${ROLES.join(" / ")}): `);
  const role = ROLES.find((r) => r.toLowerCase() === answer.toLowerCase()) as Role | undefined;
  if (!role) {
    throw new Error(`Cuenta desconocida: "${answer}"`);
  }
  await changePassword(role, await askNewPassword(role));
  console.log(`Contraseña de ${role} actualizada.`);
}

main()
  .catch((error) => {
    console.error("Error:", error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
