import type { Request } from "express";
import type { DateRange } from "@shared/schemas/common";
import type { AssignCommissionInput, CommissionFilters, CommissionItem, CommissionSellerSummary } from "@shared/schemas/commissions";
import { pool, withTransaction } from "../../db/pool";
import { recordAudit } from "../../lib/audit";
import { HttpError } from "../../lib/http-error";
import * as commissionsRepository from "./commissions.repository";

export function listSellers(range: DateRange): Promise<CommissionSellerSummary[]> {
  return commissionsRepository.findSellerSummaries(pool, range);
}

export function listItems(filters: CommissionFilters): Promise<CommissionItem[]> {
  return commissionsRepository.findItems(pool, filters);
}

/**
 * Asigna el porcentaje a artículos con comisión pendiente (motos y lo que el empleado
 * registró sin comisión). El monto lo calcula la base de datos (RF 3.2). No corrige
 * comisiones ya asignadas: eso es editar la venta, con su propio flujo y bitácora.
 * Si la venta es de un período cerrado, el trigger de la base lo rechaza (RF 7.2).
 */
export function assignPending(input: AssignCommissionInput, req: Request): Promise<CommissionItem[]> {
  return withTransaction(async (db) => {
    const before = await commissionsRepository.findItemsByIdsForUpdate(db, input.itemIds);
    if (before.length !== input.itemIds.length) {
      throw new HttpError(404, "Uno de los artículos ya no existe. Actualiza la pantalla");
    }
    const closed = before.find((item) => item.isClosed);
    if (closed) {
      throw new HttpError(409, `La venta #${closed.saleId} es de un período cerrado; su comisión ya no se puede asignar`);
    }
    const alreadyAssigned = before.find((item) => item.commissionRate !== null);
    if (alreadyAssigned) {
      throw new HttpError(409, `"${alreadyAssigned.description}" ya tiene comisión asignada. Actualiza la pantalla`);
    }

    await commissionsRepository.setPendingRate(db, input.itemIds, input.commissionRate);
    const after = await commissionsRepository.findItemsByIds(db, input.itemIds);

    for (const item of after) {
      const previous = before.find((old) => old.id === item.id)!;
      await recordAudit(db, req, {
        action: "editar",
        entity: "sale_items",
        entityId: item.id,
        before: { saleId: previous.saleId, commissionRate: previous.commissionRate, commissionAmount: previous.commissionAmount },
        after: { saleId: item.saleId, commissionRate: item.commissionRate, commissionAmount: item.commissionAmount },
      });
    }
    return after;
  });
}
