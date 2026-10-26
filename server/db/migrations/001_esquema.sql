-- Esquema inicial de SoloMotos.
-- Convención: tablas y columnas en inglés; los valores que ve el usuario (roles, estados,
-- métodos de pago) en español, iguales a shared/constants.ts.
-- El backend es el único cliente de la base: no se usan políticas RLS de Supabase.

-- ─── utilidades ─────────────────────────────────────────────────────────────

-- Fecha de negocio en hora de Guatemala. Cierres y reportes agrupan por este día,
-- no por el día UTC (una venta a las 19:00 en Guatemala ya es "mañana" en UTC).
CREATE FUNCTION business_date(ts timestamptz) RETURNS date
LANGUAGE sql IMMUTABLE AS $$
  SELECT (ts AT TIME ZONE 'America/Guatemala')::date
$$;

CREATE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ─── acceso ─────────────────────────────────────────────────────────────────

-- Solo existen dos cuentas: una por rol (RF 6.1). No hay correo.
CREATE TABLE users (
  id            serial PRIMARY KEY,
  username      text NOT NULL UNIQUE,
  role          text NOT NULL UNIQUE CHECK (role IN ('Administrador', 'Empleado')),
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ─── catálogos ──────────────────────────────────────────────────────────────

-- Vendedores y mecánicos: datos de referencia, no cuentas de acceso (RF 6.4).
CREATE TABLE staff (
  id         serial PRIMARY KEY,
  full_name  text NOT NULL CHECK (length(trim(full_name)) > 0),
  type       text NOT NULL CHECK (type IN ('Vendedor', 'Mecánico')),
  phone      text,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX staff_name_type_unique ON staff (lower(full_name), type);

-- Categorías de producto. default_commission_rate NULL = la comisión se ingresa a mano
-- en cada venta (motos); con valor = se aplica sola (accesorios 2.5 %). RNF 7.1.
CREATE TABLE categories (
  id                      serial PRIMARY KEY,
  name                    text NOT NULL UNIQUE,
  default_commission_rate numeric(5, 2) CHECK (default_commission_rate BETWEEN 0 AND 100),
  is_active               boolean NOT NULL DEFAULT true,
  sort_order              integer NOT NULL DEFAULT 0,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- Clientes con NIT o CUI, para autocompletar la facturación (RNF 3.1).
-- Consumidor Final no se guarda aquí.
CREATE TABLE clients (
  id          serial PRIMARY KEY,
  tax_id_type text NOT NULL CHECK (tax_id_type IN ('NIT', 'CUI')),
  tax_id      text NOT NULL UNIQUE,
  name        text NOT NULL,
  address     text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ─── ventas ─────────────────────────────────────────────────────────────────

CREATE TABLE sales (
  id                 bigserial PRIMARY KEY,
  -- Hora del servidor, nunca de la estación (RNF 3.2)
  sold_at            timestamptz NOT NULL DEFAULT now(),
  seller_id          integer NOT NULL REFERENCES staff (id),
  payment_method     text NOT NULL CHECK (payment_method IN ('Efectivo', 'Transferencia', 'Tarjeta')),
  is_invoiced        boolean NOT NULL DEFAULT false,
  -- Copia de los datos del cliente al momento de la venta: la factura no debe cambiar
  -- si después se corrige el registro del cliente.
  client_id          integer REFERENCES clients (id),
  client_tax_id_type text CHECK (client_tax_id_type IN ('NIT', 'CUI', 'CF')),
  client_tax_id      text,
  client_name        text,
  client_address     text,
  observations       text,
  total              numeric(12, 2) NOT NULL CHECK (total >= 0),
  created_by         integer NOT NULL REFERENCES users (id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT is_invoiced OR (client_tax_id IS NOT NULL AND client_name IS NOT NULL))
);
CREATE INDEX sales_sold_at_idx ON sales (sold_at);
CREATE INDEX sales_seller_sold_at_idx ON sales (seller_id, sold_at);

-- origin separa lo vendido en mostrador de lo cobrado en taller (servicio o repuesto),
-- para consolidar en una sola venta sin perder el rastreo.
CREATE TABLE sale_items (
  id                bigserial PRIMARY KEY,
  sale_id           bigint NOT NULL REFERENCES sales (id) ON DELETE CASCADE,
  description       text NOT NULL CHECK (length(trim(description)) > 0),
  category_id       integer NOT NULL REFERENCES categories (id),
  quantity          integer NOT NULL CHECK (quantity > 0),
  unit_price        numeric(12, 2) NOT NULL CHECK (unit_price >= 0),
  -- NULL = comisión pendiente de asignar
  commission_rate   numeric(5, 2) CHECK (commission_rate BETWEEN 0 AND 100),
  origin            text NOT NULL DEFAULT 'venta' CHECK (origin IN ('venta', 'taller_servicio', 'taller_repuesto')),
  subtotal          numeric(12, 2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  commission_amount numeric(12, 2) GENERATED ALWAYS AS (round(quantity * unit_price * commission_rate / 100, 2)) STORED
);
CREATE INDEX sale_items_sale_idx ON sale_items (sale_id);
CREATE INDEX sale_items_category_idx ON sale_items (category_id);

-- Documento FEL de una venta facturada. Mientras no haya certificador, status = 'simulado'.
CREATE TABLE fel_documents (
  id                 bigserial PRIMARY KEY,
  sale_id            bigint NOT NULL UNIQUE REFERENCES sales (id) ON DELETE CASCADE,
  status             text NOT NULL CHECK (status IN ('simulado', 'pendiente', 'certificado', 'error', 'anulado')),
  series             text,
  number             text,
  authorization_uuid text,
  certified_at       timestamptz,
  request_payload    jsonb,
  response_payload   jsonb,
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- ─── taller ─────────────────────────────────────────────────────────────────

CREATE TABLE workshop_orders (
  id               serial PRIMARY KEY,
  client_name      text NOT NULL,
  client_phone     text,
  motorcycle       text NOT NULL,
  plate            text,
  work_description text NOT NULL,
  mechanic_id      integer NOT NULL REFERENCES staff (id),
  status           text NOT NULL DEFAULT 'Recibida'
                   CHECK (status IN ('Recibida', 'En reparación', 'Lista para entregar', 'Entregada')),
  estimated_cost   numeric(12, 2) CHECK (estimated_cost >= 0),
  final_cost       numeric(12, 2) CHECK (final_cost >= 0),
  -- Venta que se genera al cobrar y entregar
  sale_id          bigint REFERENCES sales (id),
  received_at      timestamptz NOT NULL DEFAULT now(),
  delivered_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX workshop_orders_status_idx ON workshop_orders (status);

-- Servicios y repuestos usados en la orden; al cobrar se copian como sale_items.
CREATE TABLE workshop_order_items (
  id          serial PRIMARY KEY,
  order_id    integer NOT NULL REFERENCES workshop_orders (id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('servicio', 'repuesto')),
  description text NOT NULL,
  category_id integer REFERENCES categories (id),
  quantity    integer NOT NULL CHECK (quantity > 0),
  unit_price  numeric(12, 2) NOT NULL CHECK (unit_price >= 0)
);

CREATE TABLE workshop_order_events (
  id          serial PRIMARY KEY,
  order_id    integer NOT NULL REFERENCES workshop_orders (id) ON DELETE CASCADE,
  description text NOT NULL,
  created_by  integer REFERENCES users (id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ─── gastos y cierres ───────────────────────────────────────────────────────

CREATE TABLE expenses (
  id          serial PRIMARY KEY,
  spent_on    date NOT NULL,
  amount      numeric(12, 2) NOT NULL CHECK (amount > 0),
  category    text NOT NULL,
  description text NOT NULL,
  created_by  integer NOT NULL REFERENCES users (id),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX expenses_spent_on_idx ON expenses (spent_on);

CREATE TABLE closures (
  id              serial PRIMARY KEY,
  period_start    date NOT NULL,
  period_end      date NOT NULL CHECK (period_end >= period_start),
  sales_count     integer NOT NULL,
  total_amount    numeric(12, 2) NOT NULL,
  cash_amount     numeric(12, 2) NOT NULL,
  transfer_amount numeric(12, 2) NOT NULL,
  card_amount     numeric(12, 2) NOT NULL,
  closed_by       integer NOT NULL REFERENCES users (id),
  closed_at       timestamptz NOT NULL DEFAULT now()
);

-- Un período cerrado queda en solo lectura: ni agregar, ni editar, ni eliminar ventas
-- (RF 7.2, RNF 2.1). Lo garantiza la base de datos, no solo la pantalla.
CREATE FUNCTION assert_period_open(ts timestamptz) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM closures
    WHERE business_date(ts) BETWEEN period_start AND period_end
  ) THEN
    RAISE EXCEPTION 'El período del % ya está cerrado', business_date(ts)
      USING ERRCODE = 'P0001', HINT = 'periodo_cerrado';
  END IF;
END;
$$;

CREATE FUNCTION sales_guard_closed_period() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM assert_period_open(OLD.sold_at);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM assert_period_open(NEW.sold_at);
    RETURN NEW;
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER sales_closed_period
BEFORE INSERT OR UPDATE OR DELETE ON sales
FOR EACH ROW EXECUTE FUNCTION sales_guard_closed_period();

CREATE FUNCTION sale_items_guard_closed_period() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  parent_sold_at timestamptz;
BEGIN
  SELECT sold_at INTO parent_sold_at FROM sales
  WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.sale_id ELSE NEW.sale_id END;
  -- Si la venta ya no existe es un borrado en cascada, que el trigger de sales ya validó
  IF parent_sold_at IS NOT NULL THEN
    PERFORM assert_period_open(parent_sold_at);
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sale_items_closed_period
BEFORE INSERT OR UPDATE OR DELETE ON sale_items
FOR EACH ROW EXECUTE FUNCTION sale_items_guard_closed_period();

-- ─── configuración y auditoría ──────────────────────────────────────────────

CREATE TABLE settings (
  id                    integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  company_name          text NOT NULL,
  tax_id                text NOT NULL,
  address               text NOT NULL,
  phone                 text,
  logo_url              text,
  monthly_invoice_limit integer NOT NULL DEFAULT 200 CHECK (monthly_invoice_limit > 0),
  invoice_alert_percent integer NOT NULL DEFAULT 80 CHECK (invoice_alert_percent BETWEEN 1 AND 100),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- Huella de cada cambio sensible (RNF 1.2).
CREATE TABLE audit_log (
  id          bigserial PRIMARY KEY,
  user_id     integer REFERENCES users (id),
  user_role   text,
  action      text NOT NULL,
  entity      text NOT NULL,
  entity_id   text,
  before_data jsonb,
  after_data  jsonb,
  ip          text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_entity_idx ON audit_log (entity, entity_id);

-- ─── updated_at automático ──────────────────────────────────────────────────

CREATE TRIGGER users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER staff_updated_at BEFORE UPDATE ON staff FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER categories_updated_at BEFORE UPDATE ON categories FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER clients_updated_at BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER sales_updated_at BEFORE UPDATE ON sales FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER workshop_orders_updated_at BEFORE UPDATE ON workshop_orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER settings_updated_at BEFORE UPDATE ON settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── cerrar la API pública de Supabase ──────────────────────────────────────

-- Supabase expone el esquema public por su API REST a los roles anon y authenticated.
-- Como el único cliente es nuestro backend (que se conecta como dueño de las tablas),
-- se activa RLS sin políticas (nadie más puede leer ni escribir) y se quitan los permisos.
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
    REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
  END IF;
END;
$$;
