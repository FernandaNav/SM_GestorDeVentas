import { z } from "zod";

/** Totales de ventas de un rango de días, por método de pago. */
export type ClosureTotals = {
  salesCount: number;
  totalAmount: number;
  cashAmount: number;
  cashCount: number;
  transferAmount: number;
  transferCount: number;
  cardAmount: number;
  cardCount: number;
  /** Ventas con al menos un artículo sin comisión asignada */
  pendingCommissionCount: number;
};

/** El período abierto: desde el día siguiente al último cierre hasta el día elegido. */
export type OpenPeriod = ClosureTotals & {
  /** AAAA-MM-DD */
  periodStart: string;
  periodEnd: string;
  /** Hoy en Guatemala, según el servidor */
  today: string;
};

/** Fila del historial de cierres. */
export type Closure = {
  id: number;
  periodStart: string;
  periodEnd: string;
  salesCount: number;
  totalAmount: number;
  cashAmount: number;
  transferAmount: number;
  cardAmount: number;
  closedAt: string;
  closedBy: string;
};

const isoDate = z.string().date("Fecha inválida (usa AAAA-MM-DD)");

export const openPeriodQuerySchema = z.object({ to: isoDate.optional() });

export const createClosureSchema = z.object({
  // Lo que la pantalla tenía como inicio: si no coincide, otra estación cerró mientras tanto
  periodStart: isoDate,
  periodEnd: isoDate,
});
export type CreateClosureInput = z.infer<typeof createClosureSchema>;