import type { Closure, CreateClosureInput, OpenPeriod } from "@shared/schemas/closures";
import type { Page } from "@shared/schemas/common";
import { api, toQuery } from "./client";

export const closuresApi = {
  open: (to?: string) => api.get<OpenPeriod>(`/closures/open${toQuery({ to })}`),
  list: (page: number, pageSize = 10) => api.get<Page<Closure>>(`/closures${toQuery({ page, pageSize })}`),
  close: (input: CreateClosureInput) => api.post<Closure>("/closures", input),
};