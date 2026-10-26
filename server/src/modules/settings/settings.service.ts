import type { Request } from "express";
import type { Category } from "@shared/schemas/categories";
import type { Settings, SettingsInput } from "@shared/schemas/settings";
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