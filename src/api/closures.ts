import type { Closure, CreateClosureInput, OpenPeriod } from "@shared/schemas/closures";
import { api, toQuery } from "./client";

export const closuresApi = {
  open: (to?: string) => api.get<OpenPeriod>(`/closures/open${toQuery({ to })}`),
  list: () => api.get<Closure[]>("/closures"),
  close: (input: CreateClosureInput) => api.post<Closure>("/closures", input),
};