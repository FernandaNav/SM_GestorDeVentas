import type { ExpenseArea } from "@shared/constants";
import type { DateRange } from "@shared/schemas/common";
import type { Expense, ExpenseInput, ExpenseList } from "@shared/schemas/expenses";
import { api, toQuery } from "./client";

export const expensesApi = {
  /** area sin enviar = Tienda y Taller */
  list: (range: DateRange, page: number, area?: ExpenseArea, pageSize = 20) =>
    api.get<ExpenseList>(`/expenses${toQuery({ ...range, area, page, pageSize })}`),
  create: (input: ExpenseInput) => api.post<Expense>("/expenses", input),
  update: (id: number, input: ExpenseInput) => api.put<Expense>(`/expenses/${id}`, input),
  remove: (id: number) => api.delete<void>(`/expenses/${id}`),
};