import type { WorkshopStatus } from "@shared/constants";
import type { SaleDetail } from "@shared/schemas/sales";
import type {
  CreateWorkshopOrderInput,
  WorkshopCheckoutInput,
  WorkshopFilters,
  WorkshopItemInput,
  WorkshopOrderDetail,
  WorkshopOrderSummary,
} from "@shared/schemas/workshop";
import { api, toQuery } from "./client";

export const workshopApi = {
  list: (filters: Partial<WorkshopFilters> = {}) => api.get<WorkshopOrderSummary[]>(`/workshop${toQuery(filters)}`),
  get: (id: number) => api.get<WorkshopOrderDetail>(`/workshop/${id}`),
  create: (input: CreateWorkshopOrderInput) => api.post<WorkshopOrderDetail>("/workshop", input),
  addItem: (id: number, input: WorkshopItemInput) => api.post<WorkshopOrderDetail>(`/workshop/${id}/items`, input),
  removeItem: (id: number, itemId: number) => api.delete<WorkshopOrderDetail>(`/workshop/${id}/items/${itemId}`),
  changeStatus: (id: number, status: WorkshopStatus) => api.patch<WorkshopOrderDetail>(`/workshop/${id}/status`, { status }),
  checkout: (id: number, input: WorkshopCheckoutInput) =>
    api.post<{ order: WorkshopOrderDetail; sale: SaleDetail }>(`/workshop/${id}/checkout`, input),
};
