import type { Request } from "express";
import type pg from "pg";
import type { WorkshopStatus } from "@shared/constants";
import { createSaleSchema, type SaleDetail } from "@shared/schemas/sales";
import {
  formatOrderNumber,
  nextWorkshopStatus,
  type CreateWorkshopOrderInput,
  type WorkshopCheckoutInput,
  type WorkshopFilters,
  type WorkshopItemInput,
  type WorkshopOrderDetail,
  type WorkshopOrderSummary,
} from "@shared/schemas/workshop";
import { pool, withTransaction, type Queryable } from "../../db/pool";
import { recordAudit } from "../../lib/audit";
import { HttpError, notFound } from "../../lib/http-error";
import { currentUser } from "../../middlewares/auth";
import * as categoriesRepository from "../categories/categories.repository";
import * as salesService from "../sales/sales.service";
import * as staffRepository from "../staff/staff.repository";
import * as workshopRepository from "./workshop.repository";

const formatMoney = (amount: number) => "Q" + amount.toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function list(filters: WorkshopFilters): Promise<WorkshopOrderSummary[]> {
  return workshopRepository.findSummaries(pool, filters);
}

export async function get(id: number): Promise<WorkshopOrderDetail> {
  const detail = await loadDetail(pool, id);
  if (!detail) throw notFound("Orden de taller");
  return detail;
}

export function create(input: CreateWorkshopOrderInput, req: Request): Promise<WorkshopOrderDetail> {
  return withTransaction(async (db) => {
    const mechanic = await staffRepository.findById(db, input.mechanicId);
    if (!mechanic || mechanic.type !== "Mecánico" || !mechanic.isActive) {
      throw new HttpError(400, "El mecánico seleccionado no existe o está inactivo");
    }
    const id = await workshopRepository.insertOrder(db, input);
    await workshopRepository.insertEvent(db, id, `Orden recibida · mecánico: ${mechanic.fullName}`, currentUser(req).id);
    const created = (await loadDetail(db, id))!;
    await recordAudit(db, req, { action: "crear", entity: "workshop_orders", entityId: id, after: created });
    return created;
  });
}

/** Servicios y repuestos se pueden registrar hasta que la orden se cobra (RF 8.1). */
export function addItem(orderId: number, input: WorkshopItemInput, req: Request): Promise<WorkshopOrderDetail> {
  return withTransaction(async (db) => {
    await lockEditableOrder(db, orderId);
    const [category] = await categoriesRepository.findByIds(db, [input.categoryId]);
    if (!category || !category.isActive) throw new HttpError(400, "La categoría seleccionada no existe o está inactiva");

    const item = await workshopRepository.insertItem(db, orderId, input);
    await workshopRepository.insertEvent(
      db,
      orderId,
      `Se agregó ${input.kind}: ${input.description} (${input.quantity} × ${formatMoney(input.unitPrice)})`,
      currentUser(req).id,
    );
    await recordAudit(db, req, { action: "crear", entity: "workshop_order_items", entityId: item.id, after: { orderId, ...item } });
    return (await loadDetail(db, orderId))!;
  });
}

export function removeItem(orderId: number, itemId: number, req: Request): Promise<WorkshopOrderDetail> {
  return withTransaction(async (db) => {
    await lockEditableOrder(db, orderId);
    const removed = await workshopRepository.deleteItem(db, orderId, itemId);
    if (!removed) throw notFound("Servicio o repuesto");
    await workshopRepository.insertEvent(db, orderId, `Se quitó ${removed.kind}: ${removed.description}`, currentUser(req).id);
    await recordAudit(db, req, { action: "eliminar", entity: "workshop_order_items", entityId: itemId, before: { orderId, ...removed } });
    return (await loadDetail(db, orderId))!;
  });
}

/**
 * Avanza un paso: Recibida → En reparación → Lista para entregar. "Entregada" solo se
 * alcanza con checkout, porque entregar implica cobrar.
 */
export function changeStatus(orderId: number, status: WorkshopStatus, req: Request): Promise<WorkshopOrderDetail> {
  return withTransaction(async (db) => {
    const order = await workshopRepository.findById(db, orderId, { forUpdate: true });
    if (!order) throw notFound("Orden de taller");

    const next = nextWorkshopStatus(order.status);
    if (status === "Entregada") throw new HttpError(400, "Para entregar la orden usa Cobrar y entregar");
    if (status !== next) {
      throw new HttpError(409, next ? `La orden está en "${order.status}"; el siguiente paso es "${next}"` : "La orden ya fue entregada");
    }
    if (status === "Lista para entregar" && order.itemsCount === 0) {
      throw new HttpError(400, "Agrega al menos un servicio o repuesto antes de marcarla como lista");
    }

    await workshopRepository.updateStatus(db, orderId, status);
    await workshopRepository.insertEvent(db, orderId, `Pasó a ${status}`, currentUser(req).id);
    await recordAudit(db, req, {
      action: "editar",
      entity: "workshop_orders",
      entityId: orderId,
      before: { status: order.status },
      after: { status },
    });
    return (await loadDetail(db, orderId))!;
  });
}

/**
 * Cobrar y entregar: genera la venta con el núcleo de Ventas dentro de la misma
 * transacción, marcando cada artículo como servicio o repuesto de taller. Si la venta
 * falla (período cerrado, cliente inválido...), la orden queda como estaba.
 */
export function checkout(
  orderId: number,
  input: WorkshopCheckoutInput,
  req: Request,
): Promise<{ order: WorkshopOrderDetail; sale: SaleDetail }> {
  return withTransaction(async (db) => {
    const order = await workshopRepository.findById(db, orderId, { forUpdate: true });
    if (!order) throw notFound("Orden de taller");
    if (order.status === "Entregada" || order.saleId) throw new HttpError(409, "Esta orden ya fue cobrada y entregada");
    if (order.status !== "Lista para entregar") {
      throw new HttpError(409, "La orden debe estar Lista para entregar antes de cobrarla");
    }

    const items = await workshopRepository.findItems(db, orderId);
    if (items.length === 0) throw new HttpError(400, "La orden no tiene servicios ni repuestos para cobrar");
    if (items.some((item) => item.categoryId === null)) {
      throw new HttpError(400, "Hay artículos sin categoría; quítalos y vuelve a agregarlos");
    }

    const orderLabel = `Orden de taller ${formatOrderNumber(orderId)}`;
    const saleInput = {
      ...input,
      observations: input.observations ? `${orderLabel} · ${input.observations}` : orderLabel,
      items: items.map((item) => ({
        description: item.description,
        categoryId: item.categoryId!,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        origin: item.kind === "servicio" ? ("taller_servicio" as const) : ("taller_repuesto" as const),
      })),
    };
    // Mismas reglas que una venta del mostrador, ya con el total real (p. ej. el límite de CF)
    createSaleSchema.parse(saleInput);

    const sale = await salesService.createSale(saleInput, req, db);
    await workshopRepository.markDelivered(db, orderId, sale.id, sale.total);
    await workshopRepository.insertEvent(
      db,
      orderId,
      `Entregada y cobrada · venta #${sale.id} por ${formatMoney(sale.total)} (${input.paymentMethod})`,
      currentUser(req).id,
    );
    await recordAudit(db, req, {
      action: "editar",
      entity: "workshop_orders",
      entityId: orderId,
      before: { status: order.status },
      after: { status: "Entregada", saleId: sale.id, finalCost: sale.total },
    });
    return { order: (await loadDetail(db, orderId))!, sale };
  });
}

// ─── reglas internas ────────────────────────────────────────────────────────

async function lockEditableOrder(db: pg.PoolClient, orderId: number) {
  const order = await workshopRepository.findById(db, orderId, { forUpdate: true });
  if (!order) throw notFound("Orden de taller");
  if (order.status === "Entregada") throw new HttpError(409, "La orden ya fue entregada y cobrada; no se puede modificar");
  return order;
}

async function loadDetail(db: Queryable, id: number): Promise<WorkshopOrderDetail | undefined> {
  const order = await workshopRepository.findById(db, id);
  if (!order) return undefined;
  const [items, events] = await Promise.all([workshopRepository.findItems(db, id), workshopRepository.findEvents(db, id)]);
  return { ...order, items, events };
}
