import type { WorkshopStatus } from "@/temporal/localStore";

export const WORKSHOP_STATUS_SEQUENCE: WorkshopStatus[] = ["Recibida", "En reparación", "Lista para entregar", "Entregada"];

export const WORKSHOP_STATUS_TONES: Record<WorkshopStatus, "neutral" | "warning" | "success" | "info"> = {
  "Recibida": "neutral",
  "En reparación": "warning",
  "Lista para entregar": "success",
  "Entregada": "info",
};
