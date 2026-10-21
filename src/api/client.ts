// Única puerta del frontend hacia la API. Agrega el token, convierte los errores en
// ApiError y avisa cuando la sesión venció.

const TOKEN_KEY = "solomotos.token";

export const tokenStorage = {
  get: () => safeStorage(() => localStorage.getItem(TOKEN_KEY)),
  set: (token: string) => safeStorage(() => localStorage.setItem(TOKEN_KEY, token)),
  clear: () => safeStorage(() => localStorage.removeItem(TOKEN_KEY)),
};

/** Error de la API con su mensaje y, si aplica, los errores por campo del formulario. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

let onUnauthorized: () => void = () => {};
/** AuthContext lo usa para cerrar la sesión cuando la API responde 401. */
export const setUnauthorizedHandler = (handler: () => void) => {
  onUnauthorized = handler;
};

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = tokenStorage.get();
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers: {
        ...(body !== undefined && { "Content-Type": "application/json" }),
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "No hay conexión con el servidor. Revisa que esté encendido.");
  }

  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401 && token) onUnauthorized();
    throw new ApiError(response.status, data.error ?? "Ocurrió un error inesperado", data.fields);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
};

/** Arma "?a=1&b=2" omitiendo valores vacíos. */
export function toQuery(params: Record<string, string | number | boolean | undefined | null>): string {
  const entries = Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== "");
  return entries.length ? "?" + new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString() : "";
}

// localStorage puede fallar (modo privado, almacenamiento bloqueado)
function safeStorage<T>(action: () => T): T | null {
  try {
    return action();
  } catch {
    return null;
  }
}
