import type { DateRange } from "@shared/schemas/common";
import type {
  AssignCommissionInput,
  CommissionFilters,
  CommissionItem,
  CommissionSellerSummary,
} from "@shared/schemas/commissions";
import { api, toQuery } from "./client";

export const commissionsApi = {
  sellers: (range: DateRange) => api.get<CommissionSellerSummary[]>(`/commissions/sellers${toQuery(range)}`),
  items: (filters: Partial<CommissionFilters> & DateRange) => api.get<CommissionItem[]>(`/commissions/items${toQuery(filters)}`),
  assign: (input: AssignCommissionInput) => api.post<CommissionItem[]>("/commissions/assign", input),
};
