import type { Request } from "express";
import type pg from "pg";
import { INVOICE_LIMIT_ENABLED, type Role, type SaleItemOrigin } from "@shared/constants";
import type { Page, Pagination } from "@shared/schemas/common";
import type { Product } from "@shared/schemas/inventory";
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
import * as inventoryRepository from "../inventory/inventory.repository";
import * as inventoryService from "../inventory/inventory.service";
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
 * - Las líneas de mostrador con producto del inventario descuentan existencias (y una moto
 *   pasa a vendida). Si no alcanza, la venta no se guarda.
 * Taller la llama pasando su propio `db` para cobrar la orden dentro de su transacción, y las
 * categorías de la orden en `keptCategoryIds`: se pueden cobrar aunque ya estén inactivas. Sus
 * repuestos ya salieron del inventario al agregarlos a la orden, así que aquí no se descuentan.
 */
export async function createSale(input: NewSale, req: Request, db?: pg.PoolClient, keptCategoryIds?: Set<number>): Promise<SaleDetail> {
  if (!db) return withTransaction((tx) => createSale(input, req, tx, keptCategoryIds));

  const user = currentUser(req);
  await assertActiveSeller(db, input.sellerId);
  const items = await resolveItems(db, input.items, user.role, keptCategoryIds);

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
  await moveSaleStock(db, req, saleId, [], items);

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
    isAlert: INVOICE_LIMIT_ENABLED && percent >= usage.alertPercent,
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
    // Los repuestos del taller ya son de su orden: al editar la venta solo puede cambiar su precio
    if (workshopStockLines(before.items) !== workshopStockLines(items)) {
      throw new HttpError(400, "Los repuestos del inventario que vienen del taller no se pueden cambiar ni quitar; solo su precio");
    }

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
    // Solo se mueve la diferencia: si las cantidades no cambiaron, el kárdex no registra nada
    await moveSaleStock(db, req, id, before.items, items);

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
    // Lo vendido en mostrador regresa al inventario; los repuestos del taller siguen apartados
    // para su orden, que vuelve a "Lista para entregar"
    await moveSaleStock(db, req, id, before.items, []);
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
  // Productos del inventario de la venta. No se exige que sigan activos: una venta vieja se puede
  // editar aunque su producto ya no se ofrezca (el motor sí lo exige al sacar existencias nuevas).
  const productIds = [...new Set(items.flatMap((item) => (item.productId ? [item.productId] : [])))];
  const products = new Map<number, Product>();
  for (const id of productIds) {
    const product = await inventoryRepository.findProduct(db, id);
    if (product) products.set(id, product);
  }

  const lines = items.map((item) => {
    const origin = item.origin ?? "venta";
    const product = item.productId ? products.get(item.productId) : undefined;
    if (item.productId && !product) throw new HttpError(400, `El producto de "${item.description}" ya no existe en el inventario`);
    if (item.unitId && !product) throw new HttpError(400, `Elige el producto de la moto "${item.description}"`);
    if (product?.tracksUnits) {
      if (!item.unitId) throw new HttpError(400, `Elige el número de chasis de "${product.name}"`);
      if (item.quantity !== 1) throw new HttpError(400, `Cada moto se vende en su propia línea (cantidad 1): "${product.name}"`);
    } else if (product && item.unitId) {
      throw new HttpError(400, `"${product.name}" no se controla por unidad`);
    }
    // En mostrador la categoría la pone el producto, no la pantalla; las líneas del taller
    // conservan la que tenían en la orden
    const categoryId = product && origin === "venta" ? product.categoryId : item.categoryId;
    return { item, origin, categoryId };
  });

  const categoryIds = [...new Set(lines.map((line) => line.categoryId))];
  const categories = new Map((await categoriesRepository.findByIds(db, categoryIds)).map((c) => [c.id, c]));

  return lines.map(({ item, origin, categoryId }) => {
    const category = categories.get(categoryId);
    if (!category || (!category.isActive && !keptCategoryIds.has(category.id))) {
      throw new HttpError(400, `La categoría del artículo "${item.description}" no existe o está inactiva`);
    }
    const adminChoseRate = role === "Administrador" && item.commissionRate !== undefined;
    return {
      description: item.description,
      categoryId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      commissionRate: adminChoseRate ? (item.commissionRate ?? null) : category.defaultCommissionRate,
      origin,
      productId: item.productId ?? null,
      unitId: item.unitId ?? null,
    };
  });
}

/** Lo mínimo de una línea para saber qué mueve en el inventario. */
type StockItem = { origin?: SaleItemOrigin; productId?: number | null; unitId?: number | null; quantity: number };

/** Líneas de mostrador con producto, sumadas por producto y unidad: son las únicas que mueven existencias desde Ventas. */
function counterStock(items: StockItem[]): Map<string, inventoryService.StockLine> {
  const lines = new Map<string, inventoryService.StockLine>();
  for (const item of items) {
    if ((item.origin ?? "venta") !== "venta" || !item.productId) continue;
    const key = `${item.productId}:${item.unitId ?? ""}`;
    const line = lines.get(key);
    if (line) line.quantity += item.quantity;
    else lines.set(key, { productId: item.productId, unitId: item.unitId ?? null, quantity: item.quantity });
  }
  return lines;
}

/**
 * Lleva el inventario de cómo estaba la venta (`before`) a cómo queda (`after`): regresa lo que
 * se quitó o bajó y saca lo que se agregó o subió. Primero regresa, para que cambiar una pieza
 * por otra no falle por existencias.
 */
async function moveSaleStock(db: pg.PoolClient, req: Request, saleId: number, before: StockItem[], after: StockItem[]) {
  const was = counterStock(before);
  const now = counterStock(after);
  for (const [key, line] of was) {
    const returned = line.quantity - (now.get(key)?.quantity ?? 0);
    if (returned > 0) await inventoryService.returnStock(db, req, { ...line, quantity: returned }, "devolucion_venta", { saleId });
  }
  for (const [key, line] of now) {
    const taken = line.quantity - (was.get(key)?.quantity ?? 0);
    if (taken > 0) await inventoryService.takeStock(db, req, { ...line, quantity: taken }, "venta", { saleId });
  }
}

/** Huella de los repuestos del inventario que vienen del taller (producto, origen y cantidad), para compararla al editar. */
const workshopStockLines = (items: StockItem[]) =>
  items
    .filter((item) => item.origin && item.origin !== "venta" && item.productId)
    .map((item) => `${item.origin}:${item.productId}:${item.quantity}`)
    .sort()
    .join("|");

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
