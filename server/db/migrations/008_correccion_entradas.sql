-- Corrección de entradas de mercadería mal registradas (por ejemplo, 40 en vez de 4).
-- El kárdex sigue sin editarse: una corrección es un movimiento nuevo que apunta a la entrada
-- original, y el gasto que nació con esa entrada se corrige con ella.

-- Gasto que se creó junto con la entrada. Sin llave foránea a propósito: el kárdex no se puede
-- modificar, así que no puede quedar en NULL si alguien elimina el gasto desde Gastos.
ALTER TABLE inventory_movements
  ADD COLUMN expense_id integer,
  -- Una corrección apunta a la entrada que corrige
  ADD COLUMN corrects_movement_id bigint REFERENCES inventory_movements (id);

CREATE INDEX inventory_movements_corrects_idx ON inventory_movements (corrects_movement_id) WHERE corrects_movement_id IS NOT NULL;

-- Nuevo tipo de movimiento. Una corrección solo del costo no mueve existencias: cantidad 0.
ALTER TABLE inventory_movements
  DROP CONSTRAINT inventory_movements_kind_check,
  ADD CONSTRAINT inventory_movements_kind_check
    CHECK (kind IN ('entrada', 'ajuste', 'baja', 'venta', 'devolucion_venta', 'taller', 'devolucion_taller', 'correccion')),
  DROP CONSTRAINT inventory_movements_quantity_check,
  ADD CONSTRAINT inventory_movements_quantity_check
    CHECK (quantity <> 0 OR kind = 'correccion'),
  -- Solo las correcciones apuntan a otro movimiento
  ADD CONSTRAINT inventory_movements_correction_target
    CHECK ((kind = 'correccion') = (corrects_movement_id IS NOT NULL));
