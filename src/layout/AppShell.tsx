import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router";
import { useAuth, useSessionUser } from "@/auth/AuthContext";
import { CatalogProvider } from "@/catalog/CatalogContext";
import Header from "./Header";
import Sidebar from "./Sidebar";
import { useTheme } from "./theme";

// Si el menú lateral está oculto se recuerda en el navegador, igual que el tema
const SIDEBAR_KEY = "solomotos.sidebar";

function readCollapsed() {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === "collapsed";
  } catch {
    return false;
  }
}

/** Marco de las pantallas con sesión: menú, encabezado y la pantalla actual. */
export default function AppShell() {
  const user = useSessionUser();
  const { logout } = useAuth();
  const { dark } = useTheme();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  // En celular y tablet el menú es un cajón que se abre con el botón ☰ del encabezado
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();

  // Al cambiar de pantalla el cajón se cierra solo
  useEffect(() => setMenuOpen(false), [pathname]);

  // Escape también lo cierra
  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, collapsed ? "collapsed" : "expanded");
    } catch {
      // sin almacenamiento: simplemente no se recuerda
    }
  }, [collapsed]);

  return (
    <CatalogProvider>
      <div className={`app-shell${collapsed ? " sidebar-collapsed" : ""}${menuOpen ? " menu-open" : ""}`} data-dark={dark ? "" : undefined}>
        <Sidebar role={user.role} collapsed={collapsed} onToggle={() => setCollapsed((value) => !value)} />
        {/* Fondo oscuro detrás del cajón (solo en pantallas angostas): tocarlo cierra el menú */}
        <div className="sidebar-backdrop" onClick={() => setMenuOpen(false)} aria-hidden="true" />
        <div className="app-main">
          <Header user={user} onLogout={logout} onMenu={() => setMenuOpen(true)} />
          <main className="content">
            <Outlet />
          </main>
        </div>
      </div>
    </CatalogProvider>
  );
}
