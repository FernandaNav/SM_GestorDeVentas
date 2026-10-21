import type { Request } from "express";
import type { Queryable } from "../db/pool";
import { currentUser } from "../middlewares/auth";

type AuditEntry = {
  action: "crear" | "editar" | "eliminar" | "activar" | "desactivar" | "cerrar_periodo" | "cambiar_contraseña";
  entity: string;
  entityId?: string | number;
  before?: unknown;
  after?: unknown;
};

/**
 * Deja la huella de un cambio en audit_log (RNF 1.2). Pasar el mismo `db` de la
 * transacción para que la huella se guarde o se descarte junto con el cambio.
 */
export async function recordAudit(db: Queryable, req: Request, entry: AuditEntry) {
  const user = currentUser(req);
  await db.query(
    `INSERT INTO audit_log (user_id, user_role, action, entity, entity_id, before_data, after_data, ip)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      user.id,
      user.role,
      entry.action,
      entry.entity,
      entry.entityId?.toString() ?? null,
      entry.before === undefined ? null : JSON.stringify(entry.before),
      entry.after === undefined ? null : JSON.stringify(entry.after),
      req.ip ?? null,
    ],
  );
}
