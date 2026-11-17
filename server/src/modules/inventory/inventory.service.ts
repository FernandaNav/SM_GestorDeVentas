import type { Request } from "express";
import type pg from "pg";
import type { Role } from "@shared/constants";
import type { Page, Pagination } from "@shared/schemas/common";
import type {
  InventoryMovement,
  InventorySummary,
  Product,
  ProductDetail,
  ProductFilters,
  ProductInput,
  ProductOption,
  ProductUnit,
  StockAdjustmentInput,
  StockEntryInput,
  UnitUpdateInput,
} from "@shared/schemas/inventory";
import { pool, withTransaction } from "../../db/pool";
import { recordAudit } from "../../lib/audit";
import { HttpError, notFound } from "../../lib/http-error";
import { currentUser } from "../../middlewares/auth";
import * as categoriesRepository from "../categories/categories.repository";
import * as inventoryRepository from "./inventory.repository";

// ═══ motor de existencias ═══════════════════════════════════════════════════
// Lo usan Ventas y Taller (parte B, ver docs/INVENTARIO.md) DENTRO de su propia transacción,
// pasando su `db`: si la venta falla, las existencias vuelven solas con el ROLLBACK.

/** Una línea que mueve inventario. Para una moto: quantity = 1 y la unidad (chasis) elegida. */
export type StockLine = { productId: number; quantity: number; unitId?: number | null };

/** De dónde viene el movimiento, para el kárdex. */
export type StockReference = { saleId?: number | null; workshopOrderId?: number | null; note?: string | null };

/**
 * Saca existencias por una venta o por un repuesto agregado a una orden de taller.
 * - Producto normal: resta la cantidad solo si alcanza (si no, 409 "Solo quedan N de …").
 * - Moto: la unidad pasa de disponible a vendida (si ya no está disponible, 409).
 * Deja el movimiento en el kárdex. No revisa permisos: eso le toca a quien la llama.
 */
export async function takeStock(db: pg.PoolClient, req: Request, line: StockLine, kind: "venta" | "taller", ref: StockReference = {}): Promise<void> {
  const product = await inventoryRepository.lockProduct(db, line.productId);
  if (!product) throw new HttpError(400, "Uno de los productos ya no existe en el inventario");
  if (!product.isActive) throw new HttpError(400, `"${product.name}" está desactivado en el inventario`);

  if (product.tracksUnits) {
    if (kind === "taller") throw new HttpError(400, `"${product.name}" se controla por unidad y no se puede usar como repuesto`);
    if (!line.unitId) throw new HttpError(400, `Elige el número de chasis de "${product.name}"`);
    if (line.quantity !== 1) throw new HttpError(400, `Cada moto se vende en su propia línea (cantidad 1): "${product.name}"`);
    const unit = await inventoryRepository.moveUnit(db, line.unitId, product.id, "disponible", "vendida");
    if (!unit) {
      const current = await inventoryRepository.findUnit(db, line.unitId);
      throw new HttpError(
        409,
        current && current.productId === product.id
          ? `La unidad con chasis ${current.serial} ya no está disponible`
          : `La unidad elegida no pertenece a "${product.name}"`,
      );
    }
    await inventoryRepository.insertMovement(db, {
      productId: product.id,
      unitId: unit.id,
      kind,
      quantity: -1,
      stockAfter: await inventoryRepository.currentStock(db, product.id),
      ...ref,
      createdBy: currentUser(req).id,
    });
    return;
  }

  if (line.unitId) throw new HttpError(400, `"${product.name}" no se controla por unidad`);
  const stockAfter = await inventoryRepository.changeStock(db, product.id, -line.quantity);
  if (stockAfter === undefined) {
    throw new HttpError(409, product.stock === 0 ? `"${product.name}" no tiene existencias` : `Solo quedan ${product.stock} de "${product.name}"`);
  }
  await inventoryRepository.insertMovement(db, {
    productId: product.id,
    kind,
    quantity: -line.quantity,
    stockAfter,
    ...ref,
    createdBy: currentUser(req).id,
  });
}

/**
 * Regresa al inventario lo que salió con takeStock: al eliminar o editar una venta, o al quitar
 * un repuesto de una orden de taller. Funciona aunque el producto ya esté desactivado.
 */
export async function returnStock(
  db: pg.PoolClient,
  req: Request,
  line: StockLine,
  kind: "devolucion_venta" | "devolucion_taller",
  ref: StockReference = {},
): Promise<void> {
  const product = await inventoryRepository.lockProduct(db, line.productId);
  if (!product) throw new HttpError(400, "Uno de los productos ya no existe en el inventario");

  if (product.tracksUnits) {
    if (!line.unitId) throw new HttpError(400, `Falta la unidad de "${product.name}" para regresarla al inventario`);
    const unit = await inventoryRepository.moveUnit(db, line.unitId, product.id, "vendida", "disponible");
    if (!unit) throw new HttpError(409, `La unidad de "${product.name}" no estaba registrada como vendida`);
    await inventoryRepository.insertMovement(db, {
      productId: product.id,
      unitId: unit.id,
      kind,
      quantity: 1,
      stockAfter: await inventoryRepository.currentStock(db, product.id),
      ...ref,
      createdBy: currentUser(req).id,
    });
    return;
  }

  const stockAfter = await inventoryRepository.changeStock(db, product.id, line.quantity);
  await inventoryRepository.insertMovement(db, {
    productId: product.id,
    kind,
    quantity: line.quantity,
    stockAfter: stockAfter ?? (await inventoryRepository.currentStock(db, product.id)),
    ...ref,
    createdBy: currentUser(req).id,
  });
}

// ═══ catálogo ═══════════════════════════════════════════════════════════════

/** El Empleado consulta existencias y precios para vender, pero nunca el costo (RNF 1.3). */
const forRole = <T extends Product>(product: T, role: Role): T => {
  if (role === "Administrador") return product;
  const { cost, ...rest } = product;
  return rest as T;
};

export async function listProducts(filters: ProductFilters, { page, pageSize }: Pagination, role: Role): Promise<Page<Product>> {
  const scoped: ProductFilters = role === "Administrador" ? filters : { ...filters, status: "activos" };
  const totalItems = await inventoryRepository.countProducts(pool, scoped);
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(page, totalPages);
  const rows = await inventoryRepository.findProductPage(pool, scoped, pageSize, (currentPage - 1) * pageSize);
  return { items: rows.map((row) => forRole(row, role)), page: currentPage, pageSize, totalItems, totalPages };
}

export async function getProduct(id: number, role: Role): Promise<ProductDetail> {
  const product = await inventoryRepository.findProduct(pool, id);
  if (!product || (role !== "Administrador" && !product.isActive)) throw notFound("el producto");
  const units = product.tracksUnits
    ? await inventoryRepository.findUnits(pool, id, role === "Administrador" ? undefined : "disponible")
    : [];
  return forRole({ ...product, units }, role);
}

export function searchOptions(q: string): Promise<ProductOption[]> {
  return inventoryRepository.searchProducts(pool, q);
}

/** Motos disponibles de un producto, para elegir el chasis al vender. */
export async function listAvailableUnits(productId: number): Promise<ProductUnit[]> {
  const product = await inventoryRepository.findProduct(pool, productId);
  if (!product || !product.isActive) throw notFound("el producto");
  return product.tracksUnits ? inventoryRepository.findUnits(pool, productId, "disponible") : [];
}

export function summary(): Promise<InventorySummary> {
  return inventoryRepository.summarize(pool);
}

export function createProduct(input: ProductInput, req: Request): Promise<ProductDetail> {
  return withTransaction(async (db) => {
    await assertUsableCategory(db, input.categoryId);
    await assertNoDuplicate(db, input);
    const id = await inventoryRepository.insertProduct(db, input);
    const created = (await inventoryRepository.findProduct(db, id))!;
    await recordAudit(db, req, { action: "crear", entity: "products", entityId: id, after: created });
    return { ...created, units: [] };
  });
}

export function updateProduct(id: number, input: ProductInput, req: Request): Promise<ProductDetail> {
  return withTransaction(async (db) => {
    const before = await inventoryRepository.lockProduct(db, id);
    if (!before) throw notFound("el producto");
    // Puede conservar una categoría que se desactivó después, igual que las ventas
    if (input.categoryId !== before.categoryId) await assertUsableCategory(db, input.categoryId);
    await assertNoDuplicate(db, input, id);
    if (input.tracksUnits !== before.tracksUnits && before.hasMovements) {
      throw new HttpError(409, "Este producto ya tiene movimientos: no se puede cambiar si se controla por unidad");
    }
    await inventoryRepository.updateProduct(db, id, input);
    const after = (await inventoryRepository.findProduct(db, id))!;
    await recordAudit(db, req, { action: "editar", entity: "products", entityId: id, before, after });
    return { ...after, units: after.tracksUnits ? await inventoryRepository.findUnits(db, id) : [] };
  });
}

/** Desactivar no borra nada: el producto deja de ofrecerse, y su historial y existencias quedan. */
export function setActive(id: number, isActive: boolean, req: Request): Promise<Product> {
  return withTransaction(async (db) => {
    const before = await inventoryRepository.lockProduct(db, id);
    if (!before) throw notFound("el producto");
    if (before.isActive === isActive) return before;
    if (isActive) await assertUsableCategory(db, before.categoryId, "Activa primero su categoría en Configuración");
    await inventoryRepository.setProductActive(db, id, isActive);
    const after = (await inventoryRepository.findProduct(db, id))!;
    await recordAudit(db, req, { action: isActive ? "activar" : "desactivar", entity: "products", entityId: id, before, after });
    return after;
  });
}

// ═══ movimientos del Administrador ══════════════════════════════════════════

/** Entrada de mercadería: suma existencias (o registra cada moto con su chasis). */
export function addEntry(productId: number, input: StockEntryInput, req: Request): Promise<ProductDetail> {
  return withTransaction(async (db) => {
    const product = await inventoryRepository.lockProduct(db, productId);
    if (!product) throw notFound("el producto");
    if (!product.isActive) throw new HttpError(409, "Activa el producto antes de registrar entradas");
    const createdBy = currentUser(req).id;

    if (product.tracksUnits) {
      if (!input.units) throw new HttpError(400, "Este producto se controla por unidad: escribe el número de chasis de cada moto");
      const taken = await inventoryRepository.findExistingSerials(db, input.units.map((unit) => unit.serial));
      if (taken.length > 0) throw new HttpError(409, `Ya existe en el inventario el chasis ${taken.join(", ")}`);
      for (const data of input.units) {
        const unit = await inventoryRepository.insertUnit(db, productId, data);
        await inventoryRepository.insertMovement(db, {
          productId,
          unitId: unit.id,
          kind: "entrada",
          quantity: 1,
          stockAfter: await inventoryRepository.currentStock(db, productId),
          unitCost: input.unitCost,
          note: input.note,
          createdBy,
        });
      }
    } else {
      if (!input.quantity) throw new HttpError(400, "Indica la cantidad que entra");
      const stockAfter = await inventoryRepository.changeStock(db, productId, input.quantity);
      await inventoryRepository.insertMovement(db, {
        productId,
        kind: "entrada",
        quantity: input.quantity,
        stockAfter: stockAfter!,
        unitCost: input.unitCost,
        note: input.note,
        createdBy,
      });
    }

    // El costo del producto queda como el de la última compra
    if (input.unitCost !== undefined && input.unitCost !== product.cost) {
      await inventoryRepository.updateProduct(db, productId, { ...toInput(product), cost: input.unitCost });
    }
    const after = (await inventoryRepository.findProduct(db, productId))!;
    await recordAudit(db, req, {
      action: "crear",
      entity: "inventory_entries",
      entityId: productId,
      before: { stock: product.stock },
      after: { stock: after.stock, quantity: input.quantity ?? input.units?.length, units: input.units, unitCost: input.unitCost, note: input.note },
    });
    return { ...after, units: after.tracksUnits ? await inventoryRepository.findUnits(db, productId) : [] };
  });
}

/** Ajuste por conteo físico: deja las existencias en lo que de verdad hay, con su motivo. */
export function adjustStock(productId: number, input: StockAdjustmentInput, req: Request): Promise<Product> {
  return withTransaction(async (db) => {
    const product = await inventoryRepository.lockProduct(db, productId);
    if (!product) throw notFound("el producto");
    if (product.tracksUnits) throw new HttpError(400, "Las motos se ajustan una por una: da de baja la unidad que ya no está");
    const delta = input.countedStock - product.stock;
    if (delta === 0) throw new HttpError(400, `Las existencias ya son ${product.stock}: no hay nada que ajustar`);

    const stockAfter = await inventoryRepository.changeStock(db, productId, delta);
    await inventoryRepository.insertMovement(db, {
      productId,
      kind: "ajuste",
      quantity: delta,
      stockAfter: stockAfter!,
      note: input.reason,
      createdBy: currentUser(req).id,
    });
    const after = (await inventoryRepository.findProduct(db, productId))!;
    await recordAudit(db, req, { action: "editar", entity: "inventory_adjustments", entityId: productId, before: { stock: product.stock }, after: { stock: after.stock, reason: input.reason } });
    return after;
  });
}

/** Corrige el chasis o el motor de una moto que todavía no se ha vendido. */
export function updateUnit(unitId: number, input: UnitUpdateInput, req: Request): Promise<ProductUnit> {
  return withTransaction(async (db) => {
    const unit = await inventoryRepository.findUnit(db, unitId);
    if (!unit) throw notFound("la unidad");
    await inventoryRepository.lockProduct(db, unit.productId);
    if (unit.status !== "disponible") throw new HttpError(409, "Solo se pueden corregir las unidades disponibles");
    if (input.serial.toUpperCase() !== unit.serial.toUpperCase()) {
      const taken = await inventoryRepository.findExistingSerials(db, [input.serial]);
      if (taken.length > 0) throw new HttpError(409, `Ya existe en el inventario el chasis ${taken[0]}`);
    }
    const updated = await inventoryRepository.updateUnitData(db, unitId, {
      serial: input.serial,
      engineNumber: input.engineNumber === undefined ? unit.engineNumber : input.engineNumber,
    });
    await recordAudit(db, req, { action: "editar", entity: "product_units", entityId: unitId, before: unit, after: updated });
    return updated;
  });
}

/** Da de baja una moto disponible (dañada, robada, devuelta al proveedor). */
export function retireUnit(unitId: number, reason: string, req: Request): Promise<ProductUnit> {
  return withTransaction(async (db) => {
    const unit = await inventoryRepository.findUnit(db, unitId);
    if (!unit) throw notFound("la unidad");
    await inventoryRepository.lockProduct(db, unit.productId);
    const retired = await inventoryRepository.moveUnit(db, unitId, unit.productId, "disponible", "baja");
    if (!retired) throw new HttpError(409, `La unidad con chasis ${unit.serial} no está disponible`);
    await inventoryRepository.insertMovement(db, {
      productId: unit.productId,
      unitId,
      kind: "baja",
      quantity: -1,
      stockAfter: await inventoryRepository.currentStock(db, unit.productId),
      note: reason,
      createdBy: currentUser(req).id,
    });
    await recordAudit(db, req, { action: "editar", entity: "product_units", entityId: unitId, before: unit, after: { ...retired, reason } });
    return retired;
  });
}

export async function listMovements(productId: number, { page, pageSize }: Pagination): Promise<Page<InventoryMovement>> {
  if (!(await inventoryRepository.findProduct(pool, productId))) throw notFound("el producto");
  const totalItems = await inventoryRepository.countMovements(pool, productId);
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(page, totalPages);
  const items = await inventoryRepository.findMovementPage(pool, productId, pageSize, (currentPage - 1) * pageSize);
  return { items, page: currentPage, pageSize, totalItems, totalPages };
}

// ─── reglas internas ────────────────────────────────────────────────────────

async function assertUsableCategory(db: pg.PoolClient, categoryId: number, inactiveMessage = "La categoría elegida está desactivada") {
  const [category] = await categoriesRepository.findByIds(db, [categoryId]);
  if (!category) throw new HttpError(400, "La categoría elegida no existe");
  if (!category.isActive) throw new HttpError(400, inactiveMessage);
}

async function assertNoDuplicate(db: pg.PoolClient, input: ProductInput, exceptId?: number) {
  const duplicate = await inventoryRepository.findDuplicate(db, input, exceptId);
  if (!duplicate) return;
  const what = duplicate.byCode ? `el código ${duplicate.code}` : `el producto "${duplicate.name}"`;
  throw new HttpError(409, `Ya existe ${what}${duplicate.isActive ? "" : " (está desactivado: puedes volver a activarlo)"}`);
}

const toInput = (product: Product): ProductInput => ({
  name: product.name,
  code: product.code ?? undefined,
  categoryId: product.categoryId,
  salePrice: product.salePrice,
  cost: product.cost ?? null,
  minStock: product.minStock,
  tracksUnits: product.tracksUnits,
});
