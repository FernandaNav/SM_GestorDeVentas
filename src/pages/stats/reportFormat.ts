import type { StatsBucket } from "@shared/schemas/reports";
import { fmtDay, fmtDayMonth, fmtMonth, fmtMonthShort } from "@/components/dates";
import { fromApiDay } from "@/api/reports";

/** Etiqueta corta para el eje X: "14:00", "21 oct" o "Oct". */
export function bucketTick(bucket: string, kind: StatsBucket): string {
  if (kind === "hour") return `${bucket.slice(11, 13)}:00`;
  if (kind === "day") return fmtDayMonth(fromApiDay(bucket));
  return fmtMonthShort(fromApiDay(bucket));
}

/** Etiqueta completa para el tooltip: "21 oct 2026, 14:00", "21 oct 2026" u "Octubre 2026". */
export function bucketLabel(bucket: string, kind: StatsBucket): string {
  if (kind === "hour") return `${fmtDay(fromApiDay(bucket.slice(0, 10)))}, ${bucket.slice(11, 13)}:00`;
  if (kind === "day") return fmtDay(fromApiDay(bucket));
  return fmtMonth(fromApiDay(bucket));
}

/** Saludo según la hora de la estación. */
export function greeting(now = new Date()): string {
  const hour = now.getHours();
  if (hour < 12) return "Buenos días";
  if (hour < 19) return "Buenas tardes";
  return "Buenas noches";
}
