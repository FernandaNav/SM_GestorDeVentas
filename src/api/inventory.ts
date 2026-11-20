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
  EntryCorrectionInput,
  StockAdjustmentInput,
  StockEntryInput,
  UnitUpdateInput,
} from "@shared/schemas/inventory";
import { api, toQuery } from "./client";

/** Qué le pasó al gasto de una entrada al corregirla (ver correctLinkedExpense en el servidor). */
export type ExpenseCorrection =
  | { status: "actualizado"; expenseId: number; amount: number }
  | { status: "eliminado"; expenseId: number }
  | { status: "sin_cambio" | "sin_gasto" | "no_encontrado" };

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
  /** wasError = la moto se registró por error: su costo también sale del gasto de la entrada */
  retireUnit: (unitId: number, reason: string, wasError = false) =>
    api.post<ProductUnit & { expense: ExpenseCorrection }>(`/inventory/units/${unitId}/retire`, { reason, wasError }),
  correctEntry: (movementId: number, input: EntryCorrectionInput) =>
    api.post<{ product: Product; expense: ExpenseCorrection }>(`/inventory/movements/${movementId}/correct`, input),
};
