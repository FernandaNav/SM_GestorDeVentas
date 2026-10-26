import type { Category } from "@shared/schemas/categories";
import { api } from "./client";

export const categoriesApi = {
  list: () => api.get<Category[]>("/categories"),
};
