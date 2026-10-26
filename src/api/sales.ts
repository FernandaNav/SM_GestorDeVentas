import type {
  ClientLookup,
  CreateSaleInput,
  InvoiceUsage,
  SaleDetail,
  SaleFilters,
  SaleSummary,
  UpdateSaleInput,
} from "@shared/schemas/sales";
import { api, toQuery } from "./client";

export const salesApi = {
  list: (filters: SaleFilters = {}) => api.get<SaleSummary[]>(`/sales${toQuery(filters)}`),
  get: (id: number) => api.get<SaleDetail>(`/sales/${id}`),
  create: (input: CreateSaleInput) => api.post<SaleDetail>("/sales", input),
  update: (id: number, input: UpdateSaleInput) => api.put<SaleDetail>(`/sales/${id}`, input),
  delete: (id: number) => api.delete<void>(`/sales/${id}`),
  lookupClient: async (taxId: string): Promise<ClientLookup | null> => {
    if (!taxId.trim()) return null;
    try {
      return await api.get<ClientLookup>(`/sales/clients/${encodeURIComponent(taxId.trim())}`);
    } catch {
      return null;
    }
  },
  invoiceUsage: () => api.get<InvoiceUsage>("/sales/invoice-usage"),
};
