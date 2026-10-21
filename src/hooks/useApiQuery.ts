import { useCallback, useEffect, useRef, useState } from "react";
import { POLL_INTERVAL_MS } from "@shared/constants";
import { ApiError } from "@/api/client";

type QueryState<T> = {
  data: T | undefined;
  /** Solo true en la primera carga; las recargas automáticas no "parpadean". */
  loading: boolean;
  error: ApiError | null;
  /** Volver a pedir los datos ya (por ejemplo, después de guardar). */
  refetch: () => Promise<void>;
};

/**
 * Carga datos de la API y los mantiene al día entre las dos estaciones (RF 6.3):
 * vuelve a pedirlos cada 10 s y al regresar a la ventana; mientras la pestaña está
 * oculta no consulta. Cambiar `key` (por ejemplo, un filtro) vuelve a cargar.
 *
 *   const { data: staff } = useApiQuery(`staff${query}`, () => api.get<StaffMember[]>(`/staff${query}`));
 */
export function useApiQuery<T>(key: string, fetcher: () => Promise<T>, { poll = true } = {}): QueryState<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const refetch = useCallback(async () => {
    try {
      setData(await fetcherRef.current());
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, "Error inesperado"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    refetch();
    if (!poll) return;

    const tick = () => {
      if (document.visibilityState === "visible") refetch();
    };
    const intervalId = setInterval(tick, POLL_INTERVAL_MS);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(intervalId);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [key, poll, refetch]);

  return { data, loading, error, refetch };
}
