import type { DateRange } from "@shared/schemas/common";
import type { Expense, ExpenseInput } from "@shared/schemas/expenses";
import { api, toQuery } from "./client";

export const expensesApi = {
  list: (range: DateRange) => api.get<Expense[]>(`/expenses${toQuery(range)}`),
  create: (input: ExpenseInput) => api.post<Expense>("/expenses", input),
  remove: (id: number) => api.delete<void>(`/expenses/${id}`),
};