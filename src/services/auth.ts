export type Role = "Administrador" | "Empleado";

export interface UserSession {
  id: string;
  nombre: string;
  email: string;
  rol: Role;
  activo: boolean;
}

export interface LoginResult {
  ok: boolean;
  user?: UserSession;
  token?: string;
  error?: string;
  warning?: string;
}

export interface BackendStatus {
  ok: boolean;
  configured: boolean;
  database?: {
    ok: boolean;
    message: string;
  };
}

const TOKEN_KEY = "solomotos_auth_token";
const USER_KEY = "solomotos_auth_user";

export const authService = {
  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  },

  getUser(): UserSession | null {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },

  async login(params: { role?: Role; email?: string; password: string }): Promise<LoginResult> {
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        return {
          ok: false,
          error: data.error || "Error al iniciar sesión. Revisa tus credenciales.",
        };
      }

      const { user, token, warning } = data.data;

      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(USER_KEY, JSON.stringify(user));

      return {
        ok: true,
        user,
        token,
        warning,
      };
    } catch (err: any) {
      return {
        ok: false,
        error: "No se pudo conectar con el servidor backend en http://localhost:3001. Verifica que esté ejecutándose.",
      };
    }
  },

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },

  async verifySession(): Promise<UserSession | null> {
    const token = this.getToken();
    if (!token) return null;

    try {
      const res = await fetch("/api/auth/me", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        this.logout();
        return null;
      }

      const data = await res.json();
      if (data.ok && data.user) {
        localStorage.setItem(USER_KEY, JSON.stringify(data.user));
        return data.user;
      }
      return null;
    } catch {
      return this.getUser();
    }
  },

  async getStatus(): Promise<BackendStatus | null> {
    try {
      const res = await fetch("/api/auth/status");
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  },
};
