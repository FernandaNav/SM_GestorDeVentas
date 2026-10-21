import { WORKSHOP_STATUSES, type WorkshopStatus } from "@shared/constants";

export const WORKSHOP_STATUS_SEQUENCE = WORKSHOP_STATUSES;

export const WORKSHOP_STATUS_TONES: Record<WorkshopStatus, "neutral" | "warning" | "success" | "info"> = {
  "Recibida": "neutral",
  "En reparación": "warning",
  "Lista para entregar": "success",
  "Entregada": "info",
};

// Fechas en hora de Guatemala, igual que el servidor (RNF 3.2)
const DATE_TIME = new Intl.DateTimeFormat("es-GT", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "America/Guatemala",
});

export const formatDateTime = (iso: string) => DATE_TIME.format(new Date(iso));
