import type { Request } from "express";
import type { Closure, CreateClosureInput, OpenPeriod } from "@shared/schemas/closures";
import { pool, withTransaction } from "../../db/pool";
import { recordAudit } from "../../lib/audit";
import { todayInGuatemala } from "../../lib/dates";
import { HttpError } from "../../lib/http-error";
import { currentUser } from "../../middlewares/auth";
import * as closuresRepository from "./closures.repository";

/** Período abierto con sus totales, desde el primer día sin cerrar hasta `to` (hoy si no se indica). */
export async function getOpenPeriod(to?: string): Promise<OpenPeriod> {
  const today = todayInGuatemala();
  const periodStart = (await closuresRepository.findOpenPeriodStart(pool)) ?? today;
  // El fin se ajusta para que no quede antes del inicio ni después de hoy
  // (las fechas AAAA-MM-DD se pueden comparar como texto)
  let periodEnd = to ?? today;
  if (periodEnd > today) periodEnd = today;
  if (periodEnd < periodStart) periodEnd = periodStart;
  const totals = await closuresRepository.calculateTotals(pool, periodStart, periodEnd);
  return { periodStart, periodEnd, today, ...totals };
}

export function list(): Promise<Closure[]> {
  return closuresRepository.findAll(pool);
}

/**
 * Cierra el período (RF 7.1). Desde ese momento la base de datos rechaza agregar, editar o
 * eliminar ventas de esos días (RF 7.2, RNF 2.1).
 */
export function close(input: CreateClosureInput, req: Request): Promise<Closure> {
  return withTransaction(async (db) => {
    // Un cierre a la vez. El bloqueo también espera a que terminen las ventas que se están
    // guardando en este momento, así los totales incluyen todo lo que quedó dentro del período.
    // Mientras espera, las ventas nuevas también esperan: por eso se limita a 5 segundos.
    await db.query("SET LOCAL lock_timeout = '5s'");
    try {
      await db.query("LOCK TABLE closures IN ACCESS EXCLUSIVE MODE");
    } catch (error) {
      if ((error as { code?: string }).code === "55P03") {
        throw new HttpError(409, "Hay ventas guardándose en este momento. Intenta cerrar de nuevo en unos segundos");
      }
      throw error;
    }

    const today = todayInGuatemala();
    const periodStart = (await closuresRepository.findOpenPeriodStart(db)) ?? today;

    // Evita cierres encimados y el doble clic: si alguien ya cerró, el inicio cambió
    if (input.periodStart !== periodStart) {
      throw new HttpError(409, "El período cambió porque se hizo otro cierre. Recarga la página y revisa los totales");
    }
    if (input.periodEnd < periodStart) {
      throw new HttpError(400, "La fecha final no puede ser anterior al inicio del período");
    }
    if (input.periodEnd > today) {
      throw new HttpError(400, "No se pueden cerrar días que todavía no han pasado");
    }

    const totals = await closuresRepository.calculateTotals(db, periodStart, input.periodEnd);
    if (totals.salesCount === 0) {
      throw new HttpError(400, "No hay ventas en este período");
    }

    const created = await closuresRepository.insert(db, {
      periodStart,
      periodEnd: input.periodEnd,
      totals,
      closedBy: currentUser(req).id,
    });
    await recordAudit(db, req, {
      action: "cerrar_periodo",
      entity: "closures",
      entityId: created.id,
      after: { ...created, pendingCommissionCount: totals.pendingCommissionCount },
    });
    return created;
  });
}