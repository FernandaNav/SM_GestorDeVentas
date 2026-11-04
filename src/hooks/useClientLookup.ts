import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientLookup } from "@shared/schemas/sales";
import { salesApi } from "@/api/sales";

const LOOKUP_DELAY_MS = 350;
const MIN_LENGTH = 3;

type LookupState = { loading: boolean; client: ClientLookup | null };
const IDLE: LookupState = { loading: false, client: null };

/** Busca al cliente mientras se escribe su NIT o CUI y avisa con `onFound` si está registrado (RNF 3.1). */
export function useClientLookup(taxId: string, onFound: (client: ClientLookup) => void) {
  const [state, setState] = useState<LookupState>(IDLE);
  const onFoundRef = useRef(onFound);
  onFoundRef.current = onFound;

  useEffect(() => {
    const clean = taxId.trim().toUpperCase();
    if (clean === "CF" || clean.length < MIN_LENGTH) {
      setState(IDLE);
      return;
    }

    let active = true;
    setState((prev) => ({ ...prev, loading: true }));

    const timer = setTimeout(async () => {
      const client = await salesApi.lookupClient(clean);
      if (!active) return;
      setState({ loading: false, client });
      if (client) onFoundRef.current(client);
    }, LOOKUP_DELAY_MS);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [taxId]);

  const clear = useCallback(() => setState(IDLE), []);

  return { ...state, clear };
}
