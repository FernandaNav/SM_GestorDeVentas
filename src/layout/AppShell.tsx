import { Outlet } from "react-router";
import { useAuth, useSessionUser } from "@/auth/AuthContext";
import { CatalogProvider } from "@/catalog/CatalogContext";
import Header from "./Header";
import Sidebar from "./Sidebar";
import { useTheme } from "./theme";

/** Marco de las pantallas con sesión: menú, encabezado y la pantalla actual. */
export default function AppShell() {
  const user = useSessionUser();
  const { logout } = useAuth();
  const { dark } = useTheme();

  return (
    <CatalogProvider>
      <div className="app-shell" data-dark={dark ? "" : undefined}>
        <Sidebar role={user.role} />
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
