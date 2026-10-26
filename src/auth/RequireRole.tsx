import { Navigate, Outlet, useLocation } from "react-router";
import type { Role } from "@shared/constants";
import { homePathFor, paths } from "@/layout/navigation";
import { useAuth } from "./AuthContext";

/**
 * Protege un grupo de rutas: sin sesión manda al login; con un rol no permitido
 * manda a su pantalla de inicio. La API valida lo mismo (esto es solo la interfaz).
 */
export default function RequireRole({ roles }: { roles?: Role[] }) {
  const { user } = useAuth();
  const location = useLocation();

  if (user === undefined) return null; // verificando el token guardado
  if (!user) return <Navigate to={paths.login} replace state={{ from: location.pathname }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to={homePathFor(user.role)} replace />;
  return <Outlet />;
}
