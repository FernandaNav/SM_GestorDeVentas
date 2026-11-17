import type {
  InventoryMovement,
  InventorySummary,
  MovementKind,
  Product,
  ProductFilters,
  ProductInput,
  ProductOption,
  ProductUnit,
  UnitStatus,
} from "@shared/schemas/inventory";
import type { Queryable } from "../../db/pool";

const PRODUCT_COLUMNS = `
  p.id, p.code, p.name, p.category_id AS "categoryId", c.name AS "categoryName",
  p.sale_price AS "salePrice", p.cost, p.tracks_units AS "tracksUnits", p.stock, p.min_stock AS "minStock",
  (p.min_stock > 0 AND p.stock <= p.min_stock) AS "isLow", p.is_active AS "isActive",
  EXISTS (SELECT 1 FROM inventory_movements m WHERE m.product_id = p.id) AS "hasMovements"`;

const PRODUCT_FROM = `FROM products p JOIN categories c ON c.id = p.category_id`;

const PRODUCT_WHERE = `
  WHERE ($1::text IS NULL OR p.name ILIKE '%' || $1 || '%' OR p.code ILIKE '%' || $1 || '%'
         OR EXISTS (SELECT 1 FROM product_units u WHERE u.product_id = p.id AND u.serial ILIKE '%' || $1 || '%'))
    AND ($2::int IS NULL OR p.category_id = $2)
    AND ($3::text = 'todos' OR p.is_active = ($3::text = 'activos'))
    AND ($4::boolean IS NOT TRUE OR (p.min_stock > 0 AND p.stock <= p.min_stock))`;

/** Lo que escribe la persona se busca tal cual: % y _ no funcionan como comodines de ILIKE. */
const likeText = (text: string) => text.replace(/[\\%_]/g, "\\$&");

const filterParams = (filters: ProductFilters) => [
  filters.search ? likeText(filters.search) : null,
  filters.categoryId ?? null,
  filters.status,
  filters.lowStock ?? null,
];

export async function countProducts(db: Queryable, filters: ProductFilters): Promise<number> {
  const { rows } = await db.query<{ total: number }>(`SELECT count(*)::int AS total ${PRODUCT_FROM} ${PRODUCT_WHERE}`, filterParams(filters));
  return rows[0].total;
}

export async function findProductPage(db: Queryable, filters: ProductFilters, limit: number, offset: number): Promise<Product[]> {
  const { rows } = await db.query<Product>(
    `SELECT ${PRODUCT_COLUMNS} ${PRODUCT_FROM} ${PRODUCT_WHERE}
     ORDER BY p.is_active DESC, lower(p.name)
     LIMIT $5 OFFSET $6`,
    [...filterParams(filters), limit, offset],
  );
  return rows;
}

export async function findProduct(db: Queryable, id: number): Promise<Product | undefined> {
  const { rows } = await db.query<Product>(`SELECT ${PRODUCT_COLUMNS} ${PRODUCT_FROM} WHERE p.id = $1`, [id]);
  return rows[0];
}

/** Bloquea la fila del producto hasta que termine la transacción: dos cambios a la vez esperan su turno. */
export async function lockProduct(db: Queryable, id: number): Promise<Product | undefined> {
  await db.query(`SELECT id FROM products WHERE id = $1 FOR UPDATE`, [id]);
  return findProduct(db, id);
}

export async function findDuplicate(db: Queryable, input: { name: string; code?: string }, exceptId?: number) {
  const { rows } = await db.query<{ id: number; name: string; code: string | null; isActive: boolean; byCode: boolean }>(
    `SELECT id, name, code, is_active AS "isActive", ($2::text IS NOT NULL AND upper(code) = upper($2)) AS "byCode"
     FROM products
     WHERE (lower(name) = lower($1) OR ($2::text IS NOT NULL AND upper(code) = upper($2)))
       AND ($3::int IS NULL OR id <> $3)
     LIMIT 1`,
    [input.name, input.code ?? null, exceptId ?? null],
  );
  return rows[0];
}

export async function insertProduct(db: Queryable, input: ProductInput): Promise<number> {
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO products (code, name, category_id, sale_price, cost, tracks_units, min_stock)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [input.code ?? null, input.name, input.categoryId, input.salePrice, input.cost ?? null, input.tracksUnits, input.minStock],
  );
  return rows[0].id;
}

export async function updateProduct(db: Queryable, id: number, input: ProductInput): Promise<void> {
  await db.query(
    `UPDATE products
     SET code = $2, name = $3, category_id = $4, sale_price = $5, cost = $6, tracks_units = $7, min_stock = $8, updated_at = now()
     WHERE id = $1`,
    [id, input.code ?? null, input.name, input.categoryId, input.salePrice, input.cost ?? null, input.tracksUnits, input.minStock],
  );
}

export async function setProductActive(db: Queryable, id: number, isActive: boolean): Promise<void> {
  await db.query(`UPDATE products SET is_active = $2, updated_at = now() WHERE id = $1`, [id, isActive]);
}

/**
 * Suma o resta existencias de un producto normal en un solo paso. Si no alcanza, no cambia
 * nada y devuelve undefined (así dos ventas a la vez nunca venden la misma pieza).
 */
export async function changeStock(db: Queryable, id: number, delta: number): Promise<number | undefined> {
  const { rows } = await db.query<{ stock: number }>(
    `UPDATE products SET stock = stock + $2, updated_at = now()
     WHERE id = $1 AND NOT tracks_units AND stock + $2 >= 0
     RETURNING stock`,
    [id, delta],
  );
  return rows[0]?.stock;
}

export async function currentStock(db: Queryable, id: number): Promise<number> {
  const { rows } = await db.query<{ stock: number }>(`SELECT stock FROM products WHERE id = $1`, [id]);
  return rows[0]?.stock ?? 0;
}

/** Búsqueda rápida por nombre, código o chasis, solo productos activos (para vender o usar en taller). */
export async function searchProducts(db: Queryable, q: string, limit = 10): Promise<ProductOption[]> {
  const { rows } = await db.query<ProductOption>(
    `SELECT p.id, p.code, p.name, p.category_id AS "categoryId", p.sale_price AS "salePrice",
            p.tracks_units AS "tracksUnits", p.stock
     FROM products p
     JOIN categories c ON c.id = p.category_id
     WHERE p.is_active AND c.is_active
       AND (p.name ILIKE '%' || $1 || '%' OR p.code ILIKE '%' || $1 || '%'
            OR EXISTS (SELECT 1 FROM product_units u WHERE u.product_id = p.id AND u.status = 'disponible' AND u.serial ILIKE '%' || $1 || '%'))
     ORDER BY (p.stock > 0) DESC, (p.code ILIKE $1 OR p.name ILIKE $1 || '%') DESC, lower(p.name)
     LIMIT $2`,
    [likeText(q), limit],
  );
  return rows;
}

// ─── unidades (motos) ───────────────────────────────────────────────────────

const UNIT_COLUMNS = `id, product_id AS "productId", serial, engine_number AS "engineNumber", status, created_at AS "createdAt"`;

export async function findUnits(db: Queryable, productId: number, status?: UnitStatus): Promise<ProductUnit[]> {
  const { rows } = await db.query<ProductUnit>(
    `SELECT ${UNIT_COLUMNS} FROM product_units
     WHERE product_id = $1 AND ($2::text IS NULL OR status = $2)
     ORDER BY (status = 'disponible') DESC, created_at, id`,
    [productId, status ?? null],
  );
  return rows;
}

export async function findUnit(db: Queryable, unitId: number): Promise<ProductUnit | undefined> {
  const { rows } = await db.query<ProductUnit>(`SELECT ${UNIT_COLUMNS} FROM product_units WHERE id = $1`, [unitId]);
  return rows[0];
}

export async function findExistingSerials(db: Queryable, serials: string[]): Promise<string[]> {
  const { rows } = await db.query<{ serial: string }>(`SELECT serial FROM product_units WHERE upper(serial) = ANY($1::text[])`, [
    serials.map((serial) => serial.toUpperCase()),
  ]);
  return rows.map((row) => row.serial);
}

export async function insertUnit(db: Queryable, productId: number, unit: { serial: string; engineNumber?: string }): Promise<ProductUnit> {
  const { rows } = await db.query<ProductUnit>(
    `INSERT INTO product_units (product_id, serial, engine_number) VALUES ($1, $2, $3) RETURNING ${UNIT_COLUMNS}`,
    [productId, unit.serial, unit.engineNumber ?? null],
  );
  return rows[0];
}

export async function updateUnitData(db: Queryable, unitId: number, data: { serial: string; engineNumber: string | null }): Promise<ProductUnit> {
  const { rows } = await db.query<ProductUnit>(
    `UPDATE product_units SET serial = $2, engine_number = $3, updated_at = now() WHERE id = $1 RETURNING ${UNIT_COLUMNS}`,
    [unitId, data.serial, data.engineNumber],
  );
  return rows[0];
}

/**
 * Cambia el estado de una unidad solo si está en el estado esperado, en un solo paso
 * (si otra venta la tomó primero, no cambia nada y devuelve undefined).
 */
export async function moveUnit(db: Queryable, unitId: number, productId: number, from: UnitStatus, to: UnitStatus): Promise<ProductUnit | undefined> {
  const { rows } = await db.query<ProductUnit>(
    `UPDATE product_units SET status = $4, updated_at = now()
     WHERE id = $1 AND product_id = $2 AND status = $3
     RETURNING ${UNIT_COLUMNS}`,
    [unitId, productId, from, to],
  );
  return rows[0];
}

// ─── kárdex ─────────────────────────────────────────────────────────────────

export type NewMovement = {
  productId: number;
  unitId?: number | null;
  kind: MovementKind;
  quantity: number;
  stockAfter: number;
  unitCost?: number | null;
  saleId?: number | null;
  workshopOrderId?: number | null;
  note?: string | null;
  createdBy: number;
};

export async function insertMovement(db: Queryable, movement: NewMovement): Promise<number> {
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO inventory_movements (product_id, unit_id, kind, quantity, stock_after, unit_cost, sale_id, workshop_order_id, note, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
    [
      movement.productId,
      movement.unitId ?? null,
      movement.kind,
      movement.quantity,
      movement.stockAfter,
      movement.unitCost ?? null,
      movement.saleId ?? null,
      movement.workshopOrderId ?? null,
      movement.note ?? null,
      movement.createdBy,
    ],
  );
  return rows[0].id;
}

export async function countMovements(db: Queryable, productId: number): Promise<number> {
  const { rows } = await db.query<{ total: number }>(`SELECT count(*)::int AS total FROM inventory_movements WHERE product_id = $1`, [productId]);
  return rows[0].total;
}

export async function findMovementPage(db: Queryable, productId: number, limit: number, offset: number): Promise<InventoryMovement[]> {
  const { rows } = await db.query<InventoryMovement>(
    `SELECT m.id, m.product_id AS "productId", m.unit_id AS "unitId", u.serial AS "unitSerial", m.kind, m.quantity,
            m.stock_after AS "stockAfter", m.unit_cost AS "unitCost", m.sale_id AS "saleId",
            m.workshop_order_id AS "workshopOrderId", m.note, us.role AS "createdByRole", m.created_at AS "createdAt"
     FROM inventory_movements m
     LEFT JOIN product_units u ON u.id = m.unit_id
     LEFT JOIN users us ON us.id = m.created_by
     WHERE m.product_id = $1
     ORDER BY m.id DESC
     LIMIT $2 OFFSET $3`,
    [productId, limit, offset],
  );
  return rows;
}

export async function summarize(db: Queryable): Promise<InventorySummary> {
  const { rows } = await db.query<InventorySummary>(
    `SELECT count(*) FILTER (WHERE is_active)::int AS "activeProducts",
            count(*) FILTER (WHERE is_active AND min_stock > 0 AND stock <= min_stock)::int AS "lowStock",
            count(*) FILTER (WHERE is_active AND stock = 0)::int AS "outOfStock",
            coalesce(sum(stock * cost) FILTER (WHERE is_active AND cost IS NOT NULL), 0)::numeric(14, 2) AS "stockValue",
            (SELECT count(*)::int FROM product_units u JOIN products pp ON pp.id = u.product_id
             WHERE u.status = 'disponible' AND pp.is_active) AS "availableUnits"
     FROM products`,
  );
  return rows[0];
}
