-- Protege la tabla closures en la base de datos, no solo en el servidor (RF 7.2, RNF 2.1).
-- Borrar o cambiar un cierre reabriría ventas que ya deberían ser de solo lectura.

-- ─── un cierre no se edita ni se borra ──────────────────────────────────────

CREATE FUNCTION closures_reject_changes() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Los cierres de período no se pueden modificar ni eliminar'
    USING ERRCODE = 'P0001', HINT = 'cierre_inmutable';
END;
$$;

CREATE TRIGGER closures_immutable
BEFORE UPDATE OR DELETE ON closures
FOR EACH ROW EXECUTE FUNCTION closures_reject_changes();

-- TRUNCATE no dispara los triggers por fila: se bloquea aparte
CREATE TRIGGER closures_no_truncate
BEFORE TRUNCATE ON closures
FOR EACH STATEMENT EXECUTE FUNCTION closures_reject_changes();

-- ─── un cierre nuevo no se encima ni cierra días futuros ────────────────────

CREATE FUNCTION closures_validate_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.period_end > business_date(now()) THEN
    RAISE EXCEPTION 'No se pueden cerrar días que todavía no han pasado'
      USING ERRCODE = 'P0001', HINT = 'cierre_invalido';
  END IF;
  IF EXISTS (
    SELECT 1 FROM closures
    WHERE period_start <= NEW.period_end AND period_end >= NEW.period_start
  ) THEN
    RAISE EXCEPTION 'El período del % al % se encima con un cierre anterior', NEW.period_start, NEW.period_end
      USING ERRCODE = 'P0001', HINT = 'cierre_invalido';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER closures_validate
BEFORE INSERT ON closures
FOR EACH ROW EXECUTE FUNCTION closures_validate_insert();

-- Igual que en 001: estas funciones no se exponen por la API pública de Supabase
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE EXECUTE ON FUNCTION closures_reject_changes() FROM anon, authenticated;
    REVOKE EXECUTE ON FUNCTION closures_validate_insert() FROM anon, authenticated;
  END IF;
END;
$$;