import type { Role } from "@shared/constants";
import type { Category } from "@shared/schemas/categories";
import type { CategoryCreateInput, Settings, SettingsInput } from "@shared/schemas/settings";
import { api, tokenStorage } from "./client";

export const settingsApi = {
  get: () => api.get<Settings>("/settings"),
  update: (input: SettingsInput) => api.put<Settings>("/settings", input),
  updateCommission: (categoryId: number, defaultCommissionRate: number | null) =>
    api.put<Category>(`/settings/categories/${categoryId}/commission`, { defaultCommissionRate }),
  createCategory: (input: CategoryCreateInput) => api.post<Category>("/settings/categories", input),
  setCategoryActive: (categoryId: number, isActive: boolean) =>
    api.patch<Category>(`/settings/categories/${categoryId}/active`, { isActive }),
  // Si es la contraseña propia, el servidor manda un token nuevo para que la sesión siga abierta
  changePassword: async (role: Role, newPassword: string) => {
    const { token } = await api.put<{ token: string | null }>("/auth/password", { role, newPassword });
    if (token) tokenStorage.set(token);
  },
};