import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { commissionsApi } from "@/api/commissions";
import { inventoryApi } from "@/api/inventory";
import { fromApiDay } from "@/api/reports";
import { Icon } from "@/components/ui";
import { useApiQuery } from "@/hooks/useApiQuery";
import { paths } from "./navigation";

// Qué fue lo último que se vio en la campanita, guardado en el navegador de cada computadora
const STORAGE_KEY = "solomotos.notifications";
/** lowStock: cuántos productos estaban bajos al abrirla (si aumentan, vuelve a avisar) */
type Seen = { latestItemId: number; at: number; lowStock?: number };

/** El negocio cierra a las 6 pm: a las 5 pm se vuelve a avisar para revisar antes del cierre. */
const REMINDER_HOUR = 17;

/**
 * Último momento en que tocaba recordar: las 5 pm de hoy si ya pasaron; si no, el inicio del día
 * (así también avisa la primera vez que se abre el sistema en el día).
 */
function lastReminder(now: Date): number {
  const reminder = new Date(now.getFullYear(), now.getMonth(), now.getDate(), REMINDER_HOUR);
  return now >= reminder ? reminder.getTime() : new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

function readSeen(): Seen | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    return parsed && typeof parsed.latestItemId === "number" && typeof parsed.at === "number" ? parsed : null;
  } catch {
    return null;
  }
}

/** Al iniciar sesión se olvida lo visto: la campanita vuelve a avisar de las pendientes. */
export function forgetNotificationsSeen() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // sin almacenamiento: no hay nada que olvidar
  }
}

function saveSeen(seen: Seen) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seen));
  } catch {
    // sin almacenamiento: el aviso simplemente vuelve a aparecer
  }
}

const DAY_FORMAT = new Intl.DateTimeFormat("es-GT", { day: "numeric", month: "long" });
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Campanita del encabezado (solo Administrador): avisa de las comisiones pendientes de asignar
 * y de los productos del inventario con existencias bajas.
 * Para no molestar, el número naranja solo aparece cuando hay pendientes nuevas desde la última vez
 * que se abrió, al iniciar sesión, la primera vez del día y otra vez a las 5 pm (antes del cierre
 * de las 6) si siguen quedando pendientes. Recargar la página no cuenta como iniciar sesión. Al abrirla se marca como vista. Como la computadora del Administrador se queda
 * con el sistema abierto todo el día, revisa la hora cada minuto sin necesidad de recargar.
 */
export default function NotificationBell() {
  const navigate = useNavigate();
  const { data } = useApiQuery("commissions:pending-summary", commissionsApi.pendingSummary);
  const { data: inventory } = useApiQuery("inventory:summary", inventoryApi.summary);
  const [seen, setSeen] = useState<Seen | null>(readSeen);
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const wrapRef = useRef<HTMLDivElement>(null);

  // Reloj de la campanita: al dar las 5 pm el aviso aparece solo, aunque nadie toque nada
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const pending = data?.pendingSales ?? 0;
  const latestItemId = data?.latestItemId ?? 0;
  const lowStock = inventory?.lowStock ?? 0;
  const remind = !seen || seen.at < lastReminder(now);
  const unreadCommissions = pending > 0 && (remind || latestItemId > seen!.latestItemId);
  const unreadStock = lowStock > 0 && (remind || lowStock > (seen!.lowStock ?? 0));
  const unread = unreadCommissions || unreadStock;
  const alerts = pending + lowStock;

  const markSeen = () => {
    const next = { latestItemId, at: Date.now(), lowStock };
    setSeen(next);
    saveSeen(next);
  };

  const toggle = () => {
    if (!open && data) markSeen();
    setOpen(!open);
  };

  // Se cierra con clic afuera o con Escape
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const goToCommissions = () => {
    setOpen(false);
    const params = new URLSearchParams({ pendientes: "1" });
    if (data?.oldestDay) params.set("desde", data.oldestDay);
    navigate(`${paths.commissions}?${params}`);
  };

  const goToInventory = () => {
    setOpen(false);
    navigate(`${paths.inventory}?bajas=1`);
  };

  const label = unread
    ? `Notificaciones: ${[pending > 0 && `${plural(pending, "venta", "ventas")} con comisión pendiente`, lowStock > 0 && `${plural(lowStock, "producto", "productos")} con existencias bajas`].filter(Boolean).join(" y ")}`
    : "Notificaciones";

  return (
    <div className="notif-wrap" ref={wrapRef}>
      <button type="button" className={`icon-button notif-button${open ? " is-open" : ""}`} aria-label={label} title={label} aria-expanded={open} aria-haspopup="dialog" onClick={toggle}>
        <Icon name="bell" size="sm" />
        {unread && <span className="notif-badge">{alerts > 99 ? "99+" : alerts}</span>}
      </button>

      {open && (
        <div className="notif-popover" role="dialog" aria-label="Notificaciones">
          <div className="notif-head">
            Notificaciones
            <span>Se vuelve a avisar a las 5:00 p. m., antes del cierre</span>
          </div>
          {!data ? (
            <div className="notif-empty">Cargando…</div>
          ) : pending === 0 && lowStock === 0 ? (
            <div className="notif-empty">
              <Icon name="check" size="sm" />
              <span>Todo al día: no hay comisiones pendientes ni existencias bajas.</span>
            </div>
          ) : (
            <>
            {pending > 0 && (
            <div className="notif-item">
              <div className="notif-icon">
                <Icon name="coins" size="sm" />
              </div>
              <div className="notif-text">
                <strong>
                  {plural(pending, "venta", "ventas")} con comisión pendiente
                </strong>
                <span>
                  {plural(data.pendingItems, "artículo", "artículos")} sin porcentaje
                  {data.oldestDay && ` · la más antigua es del ${DAY_FORMAT.format(fromApiDay(data.oldestDay))}`}
                </span>
                <button type="button" className="picker-link notif-action" onClick={goToCommissions}>
                  Asignar comisiones
                </button>
              </div>
            </div>
            )}
            {lowStock > 0 && (
              <div className="notif-item">
                <div className="notif-icon">
                  <Icon name="box" size="sm" />
                </div>
                <div className="notif-text">
                  <strong>{plural(lowStock, "producto", "productos")} con existencias bajas</strong>
                  <span>En su mínimo o por debajo{inventory && inventory.outOfStock > 0 && ` · ${inventory.outOfStock} agotados`}</span>
                  <button type="button" className="picker-link notif-action" onClick={goToInventory}>
                    Revisar inventario
                  </button>
                </div>
              </div>
            )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
