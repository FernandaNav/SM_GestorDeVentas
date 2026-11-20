import type { Page } from "@shared/schemas/common";
import type {
  ClientLookup,
  CreateSaleInput,
  DeletedSale,
  DeletedSaleFilters,
  InvoiceUsage,
  SaleDetail,
  SaleFilters,
  SaleSummary,
  UpdateSaleInput,
} from "@shared/schemas/sales";
import { api, toQuery } from "./client";

export const salesApi = {
  list: (filters: SaleFilters, page: number, pageSize = 20) =>
    api.get<Page<SaleSummary>>(`/sales${toQuery({ ...filters, page, pageSize })}`),
  get: (id: number) => api.get<SaleDetail>(`/sales/${id}`),
  create: (input: CreateSaleInput) => api.post<SaleDetail>("/sales", input),
  update: (id: number, input: UpdateSaleInput) => api.put<SaleDetail>(`/sales/${id}`, input),
  /** El motivo es opcional y queda en el historial de ventas eliminadas */
  delete: (id: number, reason?: string) => api.delete<void>(`/sales/${id}`, reason ? { reason } : undefined),
  listDeleted: (filters: DeletedSaleFilters, page: number, pageSize = 20) =>
    api.get<Page<DeletedSale>>(`/sales/deleted${toQuery({ ...filters, page, pageSize })}`),
  lookupClient: async (taxId: string): Promise<ClientLookup | null> => {
    if (!taxId.trim()) return null;
    try {
      return await api.get<ClientLookup>(`/sales/clients/${encodeURIComponent(taxId.trim())}`);
    } catch {
      return null;
    }
  },
  invoiceUsage: () => api.get<InvoiceUsage>("/sales/invoice-usage"),
  /** Registrar, cambiar o quitar (null) la factura de la app de la SAT de una venta */
  setSatInvoice: (id: number, satInvoice: { series: string; number: string } | null) =>
    api.put<SaleDetail>(`/sales/${id}/sat-invoice`, { satInvoice }),
};
