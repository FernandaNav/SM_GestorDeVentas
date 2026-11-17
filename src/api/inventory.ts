import type { Page } from "@shared/schemas/common";
import type {
  InventoryMovement,
  InventorySummary,
  Product,
  ProductDetail,
  ProductFilters,
  ProductInput,
  ProductOption,
  ProductUnit,
  StockAdjustmentInput,
  StockEntryInput,
  UnitUpdateInput,
} from "@shared/schemas/inventory";
import { api, toQuery } from "./client";

export const inventoryApi = {
  list: (filters: Partial<ProductFilters>, page: number, pageSize = 20) =>
    api.get<Page<Product>>(`/inventory/products${toQuery({ ...filters, page, pageSize })}`),
  /** Búsqueda rápida para elegir un producto al vender o en el taller (parte B) */
  search: (q: string) => api.get<ProductOption[]>(`/inventory/products/search${toQuery({ q })}`),
  get: (id: number) => api.get<ProductDetail>(`/inventory/products/${id}`),
  /** Motos disponibles de un producto, para elegir el chasis al vender (parte B) */
  availableUnits: (id: number) => api.get<ProductUnit[]>(`/inventory/products/${id}/units`),
  summary: () => api.get<InventorySummary>("/inventory/summary"),
  create: (input: ProductInput) => api.post<ProductDetail>("/inventory/products", input),
  update: (id: number, input: ProductInput) => api.put<ProductDetail>(`/inventory/products/${id}`, input),
  setActive: (id: number, isActive: boolean) => api.patch<Product>(`/inventory/products/${id}/active`, { isActive }),
  addEntry: (id: number, input: StockEntryInput) => api.post<ProductDetail>(`/inventory/products/${id}/entries`, input),
  adjust: (id: number, input: StockAdjustmentInput) => api.post<Product>(`/inventory/products/${id}/adjustments`, input),
  movements: (id: number, page: number, pageSize = 10) =>
    api.get<Page<InventoryMovement>>(`/inventory/products/${id}/movements${toQuery({ page, pageSize })}`),
  updateUnit: (unitId: number, input: UnitUpdateInput) => api.patch<ProductUnit>(`/inventory/units/${unitId}`, input),
  retireUnit: (unitId: number, reason: string) => api.post<ProductUnit>(`/inventory/units/${unitId}/retire`, { reason }),
};
