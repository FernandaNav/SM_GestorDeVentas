-- Separa los gastos por área del negocio: Tienda o Taller (pedido de SoloMotos).

-- Los gastos que ya existían quedan como Tienda. El valor por defecto se queda para que
-- el código anterior (que no manda el área) siga funcionando mientras se actualiza;
-- el servidor nuevo siempre la exige.
ALTER TABLE expenses
  ADD COLUMN area text NOT NULL DEFAULT 'Tienda' CHECK (area IN ('Tienda', 'Taller'));

-- Para filtrar por área dentro de un rango de fechas
CREATE INDEX expenses_area_spent_on_idx ON expenses (area, spent_on);