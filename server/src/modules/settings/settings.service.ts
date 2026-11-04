import type { Request } from "express";
import type { Category } from "@shared/schemas/categories";
import type { CategoryCreateInput, Settings, SettingsInput } from "@shared/schemas/settings";
import { pool, withTransaction } from "../../db/pool";
import { recordAudit } from "../../lib/audit";
import { HttpError } from "../../lib/http-error";
import * as settingsRepository from "./settings.repository";

export function get(): Promise<Settings> {
  return settingsRepository.find(pool);
}

export function update(input: SettingsInput, req: Request): Promise<Settings> {
  return withTransaction(async (db) => {
    const before = await settingsRepository.find(db);
    const updated = await settingsRepository.update(db, input);
    await recordAudit(db, req, { action: "editar", entity: "settings", entityId: 1, before, after: updated });
    return updated;
  });
}

// Cambiar la comisión solo afecta las ventas nuevas: las ya registradas guardan su propio porcentaje.
export function updateCategoryCommission(id: number, rate: number | null, req: Request): Promise<Category> {
  return withTransaction(async (db) => {
    const before = await settingsRepository.findCategory(db, id);
    if (!before) throw new HttpError(404, "Categoría no encontrada");
    const updated = await settingsRepository.updateCategoryCommission(db, id, rate);
    await recordAudit(db, req, { action: "editar", entity: "categories", entityId: id, before, after: updated });
    return updated;
  });
}
export function createCategory(input: CategoryCreateInput, req: Request): Promise<Category> {
  return withTransaction(async (db) => {
    const existing = await settingsRepository.findCategoryByName(db, input.name);
    if (existing) {
      const hint = existing.isActive ? "" : " Está desactivada: actívala desde la lista.";
      throw new HttpError(409, `Ya existe la categoría "${existing.name}".${hint}`);
    }
    const created = await settingsRepository.insertCategory(db, input.name, input.defaultCommissionRate);
    await recordAudit(db, req, { action: "crear", entity: "categories", entityId: created.id, after: created });
    return created;
  });
}

/**
 * Una categoría desactivada ya no se ofrece en ventas ni en taller, pero sigue en las ventas
 * pasadas (que se pueden editar sin cambiarla) y en los reportes.
 */
export function setCategoryActive(id: number, isActive: boolean, req: Request): Promise<Category> {
  return withTransaction(async (db) => {
    const before = await settingsRepository.findCategory(db, id);
    if (!before) throw new HttpError(404, "Categoría no encontrada");
    if (before.isActive === isActive) return before;

    if (!isActive) {
      if ((await settingsRepository.countActiveCategories(db)) <= 1) {
        throw new HttpError(400, "Debe quedar al menos una categoría activa para poder registrar ventas");
      }
      // Si no, esas órdenes ya no se podrían cobrar: la venta rechaza categorías inactivas
      const openOrders = await settingsRepository.countOpenOrdersUsingCategory(db, id);
      if (openOrders > 0) {
        throw new HttpError(
          409,
          `No se puede desactivar: ${openOrders === 1 ? "hay 1 orden" : `hay ${openOrders} órdenes`} de taller sin cobrar con artículos de "${before.name}"`,
        );
      }
    }

    const updated = await settingsRepository.setCategoryActive(db, id, isActive);
    await recordAudit(db, req, { action: isActive ? "activar" : "desactivar", entity: "categories", entityId: id, before, after: updated });
    return updated;
  });
}
