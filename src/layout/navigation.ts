import type { Role } from "@shared/constants";
import type { IconName } from "@/components/ui";

/** Rutas de la app. Usar estas constantes en vez de escribir las URLs a mano. */
export const paths = {
  login: "/login",
  home: "/inicio",
  dashboard: "/dashboard",
  newSale: "/ventas/nueva",
  salesHistory: "/ventas",
  workshop: "/taller",
  commissions: "/comisiones",
  stats: "/estadisticas",
  expenses: "/gastos",
  staff: "/personal",
  closing: "/cierre",
  settings: "/configuracion",
} as const;

type NavItem = { path: string; label: string; title: string; icon: IconName; roles: Role[] };

const ADMIN: Role[] = ["Administrador"];
const BOTH: Role[] = ["Administrador", "Empleado"];

// Orden del menú lateral. `roles` define quién ve la opción y quién puede abrir la ruta.
export const NAV_ITEMS: NavItem[] = [
  { path: paths.home, label: "Inicio", title: "Inicio", icon: "home", roles: ["Empleado"] },
  { path: paths.dashboard, label: "Dashboard", title: "Dashboard", icon: "home", roles: ADMIN },
  { path: paths.newSale, label: "Nueva venta", title: "Registrar nueva venta", icon: "plus", roles: BOTH },
  { path: paths.salesHistory, label: "Historial", title: "Historial de ventas", icon: "history", roles: BOTH },
  { path: paths.workshop, label: "Taller", title: "Taller", icon: "wrench", roles: BOTH },
  { path: paths.commissions, label: "Comisiones", title: "Comisiones por vendedor", icon: "coins", roles: ADMIN },
  { path: paths.stats, label: "Estadísticas", title: "Estadísticas y reportes", icon: "chart", roles: ADMIN },
  { path: paths.expenses, label: "Gastos", title: "Compras y gastos", icon: "receipt", roles: ADMIN },
  { path: paths.staff, label: "Personal", title: "Personal", icon: "users", roles: ADMIN },
  { path: paths.closing, label: "Cierre", title: "Cierre de ventas", icon: "lock", roles: ADMIN },
  { path: paths.settings, label: "Configuración", title: "Configuración", icon: "settings", roles: ADMIN },
];

export const homePathFor = (role: Role) => (role === "Administrador" ? paths.dashboard : paths.home);
