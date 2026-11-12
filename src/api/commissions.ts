import type { DateRange, Page } from "@shared/schemas/common";
import type {
  AssignCommissionInput,
  CommissionFilters,
  CommissionItem,
  CommissionSellerSummary,
  PendingCommissionsSummary,
} from "@shared/schemas/commissions";
import { api, toQuery } from "./client";

export const commissionsApi = {
  sellers: (range: DateRange) => api.get<CommissionSellerSummary[]>(`/commissions/sellers${toQuery(range)}`),
  items: (filters: Partial<CommissionFilters> & DateRange, page: number, pageSize = 20) =>
    api.get<Page<CommissionItem>>(`/commissions/items${toQuery({ ...filters, page, pageSize })}`),
  pendingSummary: () => api.get<PendingCommissionsSummary>("/commissions/pending-summary"),
  assign: (input: AssignCommissionInput) => api.post<CommissionItem[]>("/commissions/assign", input),
};
