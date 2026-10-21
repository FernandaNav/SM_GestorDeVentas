import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Role } from "@shared/constants";
import type { SessionUser } from "@shared/schemas/auth";
import { api, setUnauthorizedHandler, tokenStorage } from "@/api/client";

type AuthState = {
  /** null = sin sesión. undefined = todavía verificando el token guardado. */
  user: SessionUser | null | undefined;
  login: (role: Role, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

// La sesión vive en el token guardado: recargar la página (F5) no pide volver a entrar.
// Solo se pierde al cerrar sesión o cuando el token vence (12 h).
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null | undefined>(() => (tokenStorage.get() ? undefined : null));

  const logout = useCallback(() => {
    tokenStorage.clear();
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    if (!tokenStorage.get()) return;
    api
      .get<SessionUser>("/auth/me")
      .then(setUser)
      .catch(() => setUser(null));
  }, [logout]);

  const login = useCallback(async (role: Role, password: string) => {
    const result = await api.post<{ user: SessionUser; token: string }>("/auth/login", { role, password });
    tokenStorage.set(result.token);
    setUser(result.user);
  }, []);

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return context;
}

/** Usuario de la sesión dentro de las pantallas protegidas (siempre existe ahí). */
export function useSessionUser(): SessionUser {
  const { user } = useAuth();
  if (!user) throw new Error("useSessionUser solo funciona en rutas con sesión");
  return user;
}
