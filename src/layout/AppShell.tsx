import { useEffect, useState } from "react";
import { Outlet } from "react-router";
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

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, collapsed ? "collapsed" : "expanded");
    } catch {
      // sin almacenamiento: simplemente no se recuerda
    }
  }, [collapsed]);

  return (
    <CatalogProvider>
      <div className={`app-shell${collapsed ? " sidebar-collapsed" : ""}`} data-dark={dark ? "" : undefined}>
        <Sidebar role={user.role} collapsed={collapsed} onToggle={() => setCollapsed((value) => !value)} />
        <div className="app-main">
          <Header user={user} onLogout={logout} />
          <main className="content">
            <Outlet />
          </main>
        </div>
      </div>
    </CatalogProvider>
  );
}
