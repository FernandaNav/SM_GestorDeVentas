-- Datos mínimos para arrancar. Las cuentas de acceso NO se crean aquí
-- (necesitan contraseña cifrada): usa `pnpm db:seed-users`.

INSERT INTO categories (name, default_commission_rate, sort_order) VALUES
  ('Moto nueva', NULL, 1),
  ('Moto usada', NULL, 2),
  ('Accesorio', 2.5, 3),
  ('Repuesto', 2.5, 4),
  ('Servicio de taller', NULL, 5),
  ('Otro', NULL, 6);

INSERT INTO settings (company_name, tax_id, address, phone) VALUES
  ('SoloMotos Quetzaltenango', '8214573-6', '7a. calle 4-63, zona 2, Quetzaltenango', '+502 7765 4321');
