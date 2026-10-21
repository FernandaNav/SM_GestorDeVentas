const GUATEMALA_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guatemala" });

/** Fecha de hoy en Guatemala como AAAA-MM-DD, según el reloj del servidor. */
export const todayInGuatemala = () => GUATEMALA_DAY.format(new Date());

/**
 * Condición SQL "la columna cae entre dos días de Guatemala (ambos incluidos)".
 * Se escribe como rango sobre la columna (y no con business_date(columna)) para
 * que PostgreSQL pueda usar el índice.
 */
export const betweenBusinessDays = (column: string, fromParam: string, toParam: string) =>
  `${column} >= (${fromParam}::date)::timestamp AT TIME ZONE 'America/Guatemala'
   AND ${column} < (${toParam}::date + 1)::timestamp AT TIME ZONE 'America/Guatemala'`;
