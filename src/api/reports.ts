import type { DashboardSummary, EmployeeHome, StatsFilters, StatsReport } from "@shared/schemas/reports";
import { api, toQuery } from "./client";

export const reportsApi = {
  dashboard: () => api.get<DashboardSummary>("/reports/dashboard"),
  stats: (filters: StatsFilters) => api.get<StatsReport>(`/reports/stats${toQuery(filters)}`),
  home: () => api.get<EmployeeHome>("/reports/home"),
};

/** Fecha del calendario de la pantalla → "AAAA-MM-DD" (el día local, sin pasar por UTC). */
export function toApiDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** "AAAA-MM-DD" o "AAAA-MM" de la API → fecha local a medianoche. */
export function fromApiDay(day: string): Date {
  const [year, month, date = 1] = day.split("-").map(Number);
  return new Date(year, month - 1, date);
}
