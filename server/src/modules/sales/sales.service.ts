import type { Request } from "express";
import type pg from "pg";
import type { Role, SaleItemOrigin } from "@shared/constants";
import type { DateRange } from "@shared/schemas/common";
import { calculateTotal, type CreateSaleInput, type SaleDetail, type SaleItemInput, type SaleSummary } from "@shared/schemas/sales";
import { pool, withTransaction } from "../../db/pool";
import { recordAudit } from "../../lib/audit";
import { todayInGuatemala } from "../../lib/dates";
import { HttpError, notFound } from "../../lib/http-error";
import { currentUser } from "../../middlewares/auth";
import * as categoriesRepository from "../categories/categories.repository";
import * as staffRepository from "../staff/staff.repository";
import * as salesRepository from "./sales.repository";

/** Venta con artículos que pueden venir del taller (los arma el módulo Taller al cobrar). */
export type NewSale = Omit<CreateSaleInput, "items"> & {
  items: (SaleItemInput & { origin?: SaleItemOrigin })[];
};

/**
 * Registra una venta con sus artículos en una sola transacción.
 * - La fecha y hora las pone la base de datos (RNF 3.2).
 * - Comisión por artículo: la de la categoría, salvo que el Administrador indique otra
 *   (null = pendiente). El Empleado no puede fijar comisiones.
 * - Si se factura a un NIT/CUI, guarda o actualiza el cliente para autocompletar después.
 * Taller la llama pasando su propio `db` para cobrar la orden dentro de su transacción.
 */
export async function createSale(input: NewSale, req: Request, db?: pg.PoolClient): Promise<SaleDetail> {
  if (!db) return withTransaction((tx) => createSale(input, req, tx));

  const user = currentUser(req);
  await assertActiveSeller(db, input.sellerId);
  const items = await resolveItems(db, input.items, user.role);

  const client = input.isInvoiced && input.client ? input.client : null;
  const clientSnapshot = client
    ? { taxIdType: client.taxIdType, taxId: client.taxId.toUpperCase(), name: client.name, address: client.address || null }
    : null;
  const clientId =
    clientSnapshot && clientSnapshot.taxIdType !== "CF"
      ? await salesRepository.upsertClient(db, { ...clientSnapshot, taxIdType: clientSnapshot.taxIdType })
      : null;

  const saleId = await salesRepository.insertSale(db, {
    sellerId: input.sellerId,
    paymentMethod: input.paymentMethod,
    isInvoiced: input.isInvoiced,
    clientId,
    client: clientSnapshot,
    observations: input.observations || null,
    total: calculateTotal(items),
    createdBy: user.id,
  });
  await salesRepository.insertItems(db, saleId, items);

  const created = (await salesRepository.findDetail(db, saleId))!;
  await recordAudit(db, req, { action: "crear", entity: "sales", entityId: saleId, after: created });
  return forRole(created, user.role);
}

export async function listSales(filters: import("@shared/schemas/sales").SaleFilters, role: Role): Promise<SaleSummary[]> {
  if (role === "Administrador") return salesRepository.findSummaries(pool, filters);

  // El empleado solo ve las ventas del día y sin comisiones (RNF 1.3)
  const today = todayInGuatemala();
  const sales = await salesRepository.findSummaries(pool, { ...filters, from: today, to: today });
  return sales.map(({ commissionAmount, hasPendingCommission, ...sale }) => sale);
}

export async function getSale(id: number, role: Role): Promise<SaleDetail> {
  const sale = await salesRepository.findDetail(pool, id);
  if (!sale) throw notFound("Venta");
  return forRole(sale, role);
}

export async function lookupClient(taxId: string): Promise<import("@shared/schemas/sales").ClientLookup | null> {
  const client = await salesRepository.findClientByTaxId(pool, taxId);
  return client ?? null;
}

export async function getInvoiceUsage(): Promise<import("@shared/schemas/sales").InvoiceUsage> {
  const today = todayInGuatemala();
  const monthStart = `${today.slice(0, 7)}-01`;
  const usage = await salesRepository.findMonthlyInvoiceUsage(pool, { from: monthStart, to: today });
  const percent = usage.limit > 0 ? Math.round((usage.issued / usage.limit) * 100) : 0;
  return {
    ...usage,
    percent,
    isAlert: percent >= usage.alertPercent,
    remaining: Math.max(0, usage.limit - usage.issued),
  };
}

export async function updateSale(id: number, input: NewSale, req: Request): Promise<SaleDetail> {
  return withTransaction(async (db) => {
    const user = currentUser(req);
    const before = await salesRepository.findDetail(db, id);
    if (!before) throw notFound("Venta");

    await assertActiveSeller(db, input.sellerId);
    const items = await resolveItems(db, input.items, user.role);

    const client = input.isInvoiced && input.client ? input.client : null;
    const clientSnapshot = client
      ? { taxIdType: client.taxIdType, taxId: client.taxId.toUpperCase(), name: client.name, address: client.address || null }
      : null;
    const clientId =
      clientSnapshot && clientSnapshot.taxIdType !== "CF"
        ? await salesRepository.upsertClient(db, { ...clientSnapshot, taxIdType: clientSnapshot.taxIdType })
        : null;

    await salesRepository.updateSale(db, id, {
      sellerId: input.sellerId,
      paymentMethod: input.paymentMethod,
      isInvoiced: input.isInvoiced,
      clientId,
      client: clientSnapshot,
      observations: input.observations || null,
      total: calculateTotal(items),
    });

    await salesRepository.deleteItems(db, id);
    await salesRepository.insertItems(db, id, items);

    const after = (await salesRepository.findDetail(db, id))!;
    await recordAudit(db, req, { action: "editar", entity: "sales", entityId: id, before, after });
    return forRole(after, user.role);
  });
}

export async function deleteSale(id: number, req: Request): Promise<void> {
  return withTransaction(async (db) => {
    const before = await salesRepository.findDetail(db, id);
    if (!before) throw notFound("Venta");

    await salesRepository.deleteSale(db, id);
    await recordAudit(db, req, { action: "eliminar", entity: "sales", entityId: id, before });
  });
}


// ─── reglas internas ────────────────────────────────────────────────────────

async function assertActiveSeller(db: pg.PoolClient, sellerId: number) {
  const seller = await staffRepository.findById(db, sellerId);
  if (!seller || seller.type !== "Vendedor" || !seller.isActive) {
    throw new HttpError(400, "El vendedor seleccionado no existe o está inactivo");
  }
}

async function resolveItems(db: pg.PoolClient, items: NewSale["items"], role: Role) {
  const categoryIds = [...new Set(items.map((item) => item.categoryId))];
  const categories = new Map((await categoriesRepository.findByIds(db, categoryIds)).map((c) => [c.id, c]));

  return items.map((item) => {
    const category = categories.get(item.categoryId);
    if (!category || !category.isActive) {
      throw new HttpError(400, `La categoría del artículo "${item.description}" no existe o está inactiva`);
    }
    const adminChoseRate = role === "Administrador" && item.commissionRate !== undefined;
    return {
      description: item.description,
      categoryId: item.categoryId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      commissionRate: adminChoseRate ? (item.commissionRate ?? null) : category.defaultCommissionRate,
      origin: item.origin ?? "venta",
    };
  });
}

function forRole(sale: SaleDetail, role: Role): SaleDetail {
  if (role === "Administrador") return sale;
  return { ...sale, items: sale.items.map(({ commissionRate, commissionAmount, ...item }) => item) };
}
