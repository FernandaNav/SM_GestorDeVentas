import type { Request } from "express";
import type { Role } from "@shared/constants";
import type { StaffFilters, StaffInput, StaffMember } from "@shared/schemas/staff";
import { pool, withTransaction } from "../../db/pool";
import { recordAudit } from "../../lib/audit";
import { notFound } from "../../lib/http-error";
import * as staffRepository from "./staff.repository";

export function list(filters: StaffFilters, role: Role): Promise<StaffMember[]> {
  // El empleado solo necesita a quienes están activos (para elegir vendedor o mecánico)
  const effectiveFilters = role === "Administrador" ? filters : { ...filters, active: true };
  return staffRepository.findAll(pool, effectiveFilters);
}

export function create(input: StaffInput, req: Request): Promise<StaffMember> {
  return withTransaction(async (db) => {
    const created = await staffRepository.insert(db, input);
    await recordAudit(db, req, { action: "crear", entity: "staff", entityId: created.id, after: created });
    return created;
  });
}

export function update(id: number, input: StaffInput, req: Request): Promise<StaffMember> {
  return withTransaction(async (db) => {
    const before = await staffRepository.findById(db, id);
    if (!before) throw notFound("Personal");
    const updated = (await staffRepository.update(db, id, input))!;
    await recordAudit(db, req, { action: "editar", entity: "staff", entityId: id, before, after: updated });
    return updated;
  });
}

// No se elimina a nadie: sus ventas y órdenes pasadas lo siguen referenciando (RF 6.4).
export function setActive(id: number, isActive: boolean, req: Request): Promise<StaffMember> {
  return withTransaction(async (db) => {
    const updated = await staffRepository.setActive(db, id, isActive);
    if (!updated) throw notFound("Personal");
    await recordAudit(db, req, { action: isActive ? "activar" : "desactivar", entity: "staff", entityId: id });
    return updated;
  });
}
