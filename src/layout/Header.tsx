import { useLocation } from "react-router";
import type { SessionUser } from "@shared/schemas/auth";
import { Icon, IconButton } from "@/components/ui";
import { useCurrentDate } from "@/hooks/useCurrentDate";
import { capitalize, LONG_DATE_FORMAT, SHORT_DATE_FORMAT } from "@/lib/format";
import { NAV_ITEMS } from "./navigation";
import { useTheme } from "./theme";

export default function Header({ user, onLogout }: { user: SessionUser; onLogout: () => void }) {
  const { dark, setDark } = useTheme();
  const { pathname } = useLocation();
  const today = useCurrentDate();
  const title = NAV_ITEMS.find((item) => item.path === pathname)?.title ?? "SoloMotos";
  const formattedLongDate = capitalize(LONG_DATE_FORMAT.format(today));

  return (
    <header className="topbar">
      <div className="topbar-heading">
        <div className="page-kicker">SoloMotos / {title}</div>
        <div className="page-title" title={title}>
          {title}
        </div>
      </div>
      <div className="top-actions">
        <div className="date-pill" title={formattedLongDate}>
          <Icon name="calendar" size="sm" />
          <span className="date-long">{formattedLongDate}</span>
          <span className="date-short">{capitalize(SHORT_DATE_FORMAT.format(today))}</span>
        </div>
        <IconButton icon="bell" label="Notificaciones" />
        <IconButton icon={dark ? "sun" : "moon"} label={dark ? "Tema claro" : "Tema oscuro"} onClick={() => setDark(!dark)} />
        <div className="user-menu" title={user.role}>
          <div className="avatar">
            <Icon name="users" size="sm" />
          </div>
          <div className="user-menu-name">
            <strong>{user.role}</strong>
          </div>
        </div>
        <IconButton icon="logout" label="Cerrar sesión" onClick={onLogout} />
      </div>
    </header>
  );
}
