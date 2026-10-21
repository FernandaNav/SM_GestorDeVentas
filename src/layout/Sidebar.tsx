import { NavLink } from "react-router";
import type { Role } from "@shared/constants";
import { Icon } from "@/components/ui";
import logo from "@/imports/solomotos-logo.png";
import { NAV_ITEMS, paths } from "./navigation";

export default function Sidebar({ role }: { role: Role }) {
  const items = NAV_ITEMS.filter((item) => item.roles.includes(role));
  return (
    <aside className="sidebar">
      <div className="brand">
        <img className="brand-logo" src={logo} alt="SoloMotos" />
        <div className="brand-subtitle">Sistema de Ventas</div>
      </div>
      <nav className="nav-list">
        {items.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            // "/ventas" no debe quedar activo cuando se está en "/ventas/nueva"
            end={item.path === paths.salesHistory}
            className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
          >
            <Icon name={item.icon} size="sm" />
            <span>{role === "Empleado" && item.path === paths.salesHistory ? "Historial del día" : item.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-help">
        <div className="sidebar-help-icon">
          <Icon name="wrench" size="sm" />
        </div>
        <div>
          <strong>¿Necesitas ayuda?</strong>
          <span>Contacta al administrador</span>
        </div>
      </div>
    </aside>
  );
}
