import { NavLink } from "react-router";
import type { Role } from "@shared/constants";
import { Icon } from "@/components/ui";
import logo from "@/imports/solomotos-logo.png";
import { NAV_ITEMS, paths } from "./navigation";

export default function Sidebar({ role, collapsed, onToggle }: { role: Role; collapsed: boolean; onToggle: () => void }) {
  const items = NAV_ITEMS.filter((item) => item.roles.includes(role));
  const toggleLabel = collapsed ? "Mostrar menú" : "Ocultar menú";
  return (
    <aside className="sidebar">
      <button type="button" className="sidebar-toggle" onClick={onToggle} aria-label={toggleLabel} title={toggleLabel} aria-expanded={!collapsed}>
        <Icon name="chevron" size="sm" />
      </button>
      <div className="brand">
        <div className="brand-full">
          <img className="brand-logo" src={logo} alt="SoloMotos" />
          <div className="brand-subtitle">Sistema de Ventas</div>
        </div>
        {/* Con el menú oculto solo cabe un ícono */}
        <div className="brand-mark brand-compact" title="SoloMotos">
          <Icon name="bike" />
        </div>
      </div>
      <nav className="nav-list">
        {items.map((item) => {
          const label = role === "Empleado" && item.path === paths.salesHistory ? "Historial del día" : item.label;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              // "/ventas" no debe quedar activo cuando se está en "/ventas/nueva"
              end={item.path === paths.salesHistory}
              className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
              // Con el menú oculto el nombre aparece al pasar el mouse
              title={collapsed ? label : undefined}
              aria-label={collapsed ? label : undefined}
            >
              <Icon name={item.icon} size="sm" />
              <span>{label}</span>
            </NavLink>
          );
        })}
      </nav>
    </aside>
  );
}
