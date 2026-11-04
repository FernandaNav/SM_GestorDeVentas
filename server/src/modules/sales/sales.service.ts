import type { Request } from "express";
import type pg from "pg";
import type { Role, SaleItemOrigin } from "@shared/constants";
import type { Page, Pagination } from "@shared/schemas/common";
import {
  calculateTotal,
  type CreateSaleInput,
  type DeletedSale,
  type DeletedSaleFilters,
  type SaleDetail,
  type SaleFilters,
  type SaleItemInput,
  type SaleSummary,
} from "@shared/schemas/sales";
import { pool, withTransaction } from "../../db/pool";
import { recordAudit } from "../../lib/audit";
import { businessDayOf, todayInGuatemala } from "../../lib/dates";
import { formatMoney } from "../../lib/format";
import { HttpError, notFound } from "../../lib/http-error";
import { currentUser } from "../../middlewares/auth";
import * as categoriesRepository from "../categories/categories.repository";
import * as staffRepository from "../staff/staff.repository";
import * as workshopRepository from "../workshop/workshop.repository";
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

export async function listSales(filters: SaleFilters, { page, pageSize }: Pagination, role: Role): Promise<Page<SaleSummary>> {
  // El empleado solo ve las ventas del día y sin comisiones (RNF 1.3)
  const isAdmin = role === "Administrador";
  const today = todayInGuatemala();
  const scoped = isAdmin ? filters : { ...filters, from: today, to: today };

  const totalItems = await salesRepository.countSummaries(pool, scoped);
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(page, totalPages);
  const rows = await salesRepository.findSummaryPage(pool, scoped, pageSize, (currentPage - 1) * pageSize);
  const items = isAdmin ? rows : rows.map(({ commissionAmount, hasPendingCommission, ...sale }) => sale);
  return { items, page: currentPage, pageSize, totalItems, totalPages };
}

export async function getSale(id: number, role: Role): Promise<SaleDetail> {
  const sale = await salesRepository.findDetail(pool, id);
  if (!sale) throw notFound("la venta");
  // Igual que en la lista: el empleado solo consulta las ventas de hoy (RNF 1.3)
  if (role !== "Administrador" && businessDayOf(sale.soldAt) !== todayInGuatemala()) throw notFound("la venta");
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
    if (!before) throw notFound("la venta");

    // Quien ya no trabaja aquí puede seguir en sus ventas pasadas; solo no se le puede asignar una nueva
    if (input.sellerId !== before.sellerId) await assertActiveSeller(db, input.sellerId);
    // Igual que con el vendedor: puede conservar una categoría que se desactivó después
    const items = await resolveItems(db, input.items, user.role, new Set(before.items.map((item) => item.categoryId)));

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
    await syncWorkshopOrderTotal(db, req, before, after);
    return forRole(after, user.role);
  });
}

export async function deleteSale(id: number, req: Request, reason?: string): Promise<void> {
  return withTransaction(async (db) => {
    const before = await salesRepository.findDetail(db, id);
    if (!before) throw notFound("la venta");

    await reopenWorkshopOrder(db, req, before);
    await salesRepository.deleteSale(db, id);
    // La copia completa (before) es lo que muestra el historial de ventas eliminadas
    await recordAudit(db, req, { action: "eliminar", entity: "sales", entityId: id, before, after: reason ? { reason } : undefined });
  });
}

/** Historial de ventas eliminadas, de la más reciente a la más antigua. Solo Administrador. */
export async function listDeletedSales(filters: DeletedSaleFilters, { page, pageSize }: Pagination): Promise<Page<DeletedSale>> {
  const totalItems = await salesRepository.countDeleted(pool, filters);
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(page, totalPages);
  const items = await salesRepository.findDeletedPage(pool, filters, pageSize, (currentPage - 1) * pageSize);
  return { items, page: currentPage, pageSize, totalItems, totalPages };
}


// ─── reglas internas ────────────────────────────────────────────────────────

async function assertActiveSeller(db: pg.PoolClient, sellerId: number) {
  const seller = await staffRepository.findById(db, sellerId);
  if (!seller || seller.type !== "Vendedor" || !seller.isActive) {
    throw new HttpError(400, "El vendedor seleccionado no existe o está inactivo");
  }
}

async function resolveItems(db: pg.PoolClient, items: NewSale["items"], role: Role, keptCategoryIds = new Set<number>()) {
  const categoryIds = [...new Set(items.map((item) => item.categoryId))];
  const categories = new Map((await categoriesRepository.findByIds(db, categoryIds)).map((c) => [c.id, c]));

  return items.map((item) => {
    const category = categories.get(item.categoryId);
    if (!category || (!category.isActive && !keptCategoryIds.has(category.id))) {
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

/** Si la venta editada salió de una orden de taller, la orden debe mostrar lo que realmente se cobró. */
async function syncWorkshopOrderTotal(db: pg.PoolClient, req: Request, before: SaleDetail, after: SaleDetail) {
  if (after.total === before.total) return;
  const orderId = await workshopRepository.updateFinalCostBySale(db, after.id, after.total);
  if (!orderId) return;

  await workshopRepository.insertEvent(
    db,
    orderId,
    `Venta #${after.id} editada: el total pasó de ${formatMoney(before.total)} a ${formatMoney(after.total)}`,
    currentUser(req).id,
  );
  await recordAudit(db, req, {
    action: "editar",
    entity: "workshop_orders",
    entityId: orderId,
    before: { finalCost: before.total },
    after: { finalCost: after.total },
  });
}

/** Si la venta que se elimina salió de una orden de taller, la orden vuelve a quedar pendiente de cobro. */
async function reopenWorkshopOrder(db: pg.PoolClient, req: Request, sale: SaleDetail) {
  const orderId = await workshopRepository.reopenOrderOfSale(db, sale.id);
  if (!orderId) return;

  await workshopRepository.insertEvent(
    db,
    orderId,
    `Se eliminó la venta #${sale.id} por ${formatMoney(sale.total)}: la orden vuelve a Lista para entregar`,
    currentUser(req).id,
  );
  await recordAudit(db, req, {
    action: "editar",
    entity: "workshop_orders",
    entityId: orderId,
    before: { status: "Entregada", saleId: sale.id, finalCost: sale.total },
    after: { status: "Lista para entregar", saleId: null, finalCost: null },
  });
}

function forRole(sale: SaleDetail, role: Role): SaleDetail {
  if (role === "Administrador") return sale;
  return { ...sale, items: sale.items.map(({ commissionRate, commissionAmount, ...item }) => item) };
}
