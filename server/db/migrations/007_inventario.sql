-- Inventario (pedido del cliente en noviembre de 2026).
-- Productos con existencias, motos por unidad (número de chasis) y un kárdex de movimientos
-- que no se edita ni se borra. Las ventas pueden mezclar productos del inventario con líneas
-- escritas a mano (servicios, cobros especiales): por eso product_id es opcional en sale_items.
-- Lo importante lo protege la base de datos, no solo el servidor:
--   · las existencias nunca bajan de 0 (no se vende lo que no hay, ni con dos ventas a la vez)
--   · una moto (unidad) solo puede estar en una línea de venta
--   · las existencias de un producto por unidades = sus unidades disponibles (trigger)
--   · el kárdex es de solo lectura

-- ─── productos ──────────────────────────────────────────────────────────────

CREATE TABLE products (
  id          serial PRIMARY KEY,
  -- Código interno o SKU, opcional
  code        text CHECK (code IS NULL OR length(trim(code)) > 0),
  name        text NOT NULL CHECK (length(trim(name)) > 0),
  category_id integer NOT NULL REFERENCES categories (id),
  -- Precio de venta sugerido: en la venta se puede cobrar otro
  sale_price  numeric(12, 2) NOT NULL CHECK (sale_price >= 0),
  -- Costo de compra (información financiera: solo la ve el Administrador)
  cost        numeric(12, 2) CHECK (cost >= 0),
  -- true = se controla cada unidad por su número de chasis o serie (motos)
  tracks_units boolean NOT NULL DEFAULT false,
  stock       integer NOT NULL DEFAULT 0 CONSTRAINT products_stock_nonnegative CHECK (stock >= 0),
  -- Con existencias en este número o menos, el producto aparece como "existencias bajas"
  min_stock   integer NOT NULL DEFAULT 0 CHECK (min_stock >= 0),
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX products_name_key ON products (lower(name));
CREATE UNIQUE INDEX products_code_key ON products (upper(code)) WHERE code IS NOT NULL;
CREATE INDEX products_category_idx ON products (category_id);

-- Unidades de los productos que se controlan una por una (cada moto con su chasis).
CREATE TABLE product_units (
  id            serial PRIMARY KEY,
  product_id    integer NOT NULL REFERENCES products (id),
  serial        text NOT NULL CHECK (length(trim(serial)) > 0),
  engine_number text CHECK (engine_number IS NULL OR length(trim(engine_number)) > 0),
  status        text NOT NULL DEFAULT 'disponible' CHECK (status IN ('disponible', 'vendida', 'baja')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
-- Un número de chasis existe una sola vez en todo el inventario, sin importar mayúsculas
CREATE UNIQUE INDEX product_units_serial_key ON product_units (upper(serial));
CREATE INDEX product_units_product_idx ON product_units (product_id, status);

-- ─── relación con ventas y taller ───────────────────────────────────────────

ALTER TABLE sale_items
  ADD COLUMN product_id integer REFERENCES products (id),
  ADD COLUMN unit_id    integer REFERENCES product_units (id),
  -- Una línea con unidad es una sola moto, y esa moto es de ese producto
  ADD CONSTRAINT sale_items_unit_single CHECK (unit_id IS NULL OR (product_id IS NOT NULL AND quantity = 1));
-- Una moto no puede venderse en dos líneas (ni en dos ventas)
CREATE UNIQUE INDEX sale_items_unit_key ON sale_items (unit_id) WHERE unit_id IS NOT NULL;
CREATE INDEX sale_items_product_idx ON sale_items (product_id) WHERE product_id IS NOT NULL;

-- Repuestos del inventario usados en una orden de taller (se apartan al agregarlos)
ALTER TABLE workshop_order_items
  ADD COLUMN product_id integer REFERENCES products (id);
CREATE INDEX workshop_order_items_product_idx ON workshop_order_items (product_id) WHERE product_id IS NOT NULL;

-- ─── kárdex ─────────────────────────────────────────────────────────────────

-- Cada cambio de existencias deja un movimiento. quantity es con signo: + entra, − sale.
-- sale_id y workshop_order_id no llevan llave foránea a propósito: una venta puede eliminarse
-- y su movimiento (y el de devolución) deben quedar como historial.
CREATE TABLE inventory_movements (
  id                bigserial PRIMARY KEY,
  product_id        integer NOT NULL REFERENCES products (id),
  unit_id           integer REFERENCES product_units (id),
  kind              text NOT NULL CHECK (kind IN ('entrada', 'ajuste', 'baja', 'venta', 'devolucion_venta', 'taller', 'devolucion_taller')),
  quantity          integer NOT NULL CHECK (quantity <> 0),
  stock_after       integer NOT NULL CHECK (stock_after >= 0),
  unit_cost         numeric(12, 2) CHECK (unit_cost >= 0),
  sale_id           bigint,
  workshop_order_id integer,
  note              text,
  created_by        integer REFERENCES users (id),
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inventory_movements_product_idx ON inventory_movements (product_id, id DESC);
CREATE INDEX inventory_movements_sale_idx ON inventory_movements (sale_id) WHERE sale_id IS NOT NULL;

-- El kárdex no se corrige borrando: un error se compensa con otro movimiento (un ajuste)
CREATE FUNCTION inventory_movements_reject_changes() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Los movimientos de inventario no se pueden modificar ni eliminar'
    USING ERRCODE = 'P0001', HINT = 'kardex_inmutable';
END;
$$;

CREATE TRIGGER inventory_movements_immutable
BEFORE UPDATE OR DELETE ON inventory_movements
FOR EACH ROW EXECUTE FUNCTION inventory_movements_reject_changes();

CREATE TRIGGER inventory_movements_no_truncate
BEFORE TRUNCATE ON inventory_movements
FOR EACH STATEMENT EXECUTE FUNCTION inventory_movements_reject_changes();

-- ─── existencias de los productos por unidad ────────────────────────────────

-- Para una moto, "existencias" es cuántas unidades están disponibles. Se recalcula aquí
-- cada vez que una unidad se agrega, se vende, se da de baja o vuelve, para que el número
-- nunca se desfase de las unidades reales.
CREATE FUNCTION product_units_sync_stock() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    UPDATE products
    SET stock = (SELECT count(*) FROM product_units WHERE product_id = NEW.product_id AND status = 'disponible'),
        updated_at = now()
    WHERE id = NEW.product_id;
  END IF;
  IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND OLD.product_id <> NEW.product_id) THEN
    UPDATE products
    SET stock = (SELECT count(*) FROM product_units WHERE product_id = OLD.product_id AND status = 'disponible'),
        updated_at = now()
    WHERE id = OLD.product_id;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER product_units_stock
AFTER INSERT OR UPDATE OR DELETE ON product_units
FOR EACH ROW EXECUTE FUNCTION product_units_sync_stock();

-- Igual que en 001: RLS sin políticas y sin permisos para la API pública de Supabase
-- (el único cliente es nuestro backend, que se conecta como dueño de las tablas)
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON products, product_units, inventory_movements FROM anon, authenticated;
    REVOKE ALL ON SEQUENCE products_id_seq, product_units_id_seq, inventory_movements_id_seq FROM anon, authenticated;
    REVOKE EXECUTE ON FUNCTION inventory_movements_reject_changes() FROM anon, authenticated;
    REVOKE EXECUTE ON FUNCTION product_units_sync_stock() FROM anon, authenticated;
  END IF;
END;
$$;
