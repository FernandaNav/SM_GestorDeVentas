/** Texto de un campo de monto → número ("Q 1,250.50" → 1250.5). Vacío = undefined, para que la validación lo pida. */
export function toAmount(text: string): number | undefined {
  const clean = text.replace(/[Q,\s]/g, "");
  if (clean === "") return undefined;
  const value = Number(clean);
  return Number.isFinite(value) ? value : undefined;
}

/** Texto de un campo de cantidad entera. Vacío o inválido = undefined. */
export function toCount(text: string): number | undefined {
  const clean = text.replace(/[,\s]/g, "");
  if (!/^\d+$/.test(clean)) return undefined;
  return Number(clean);
}

export const MOVEMENT_DATE_FORMAT = new Intl.DateTimeFormat("es-GT", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
