import type { Role } from "@shared/constants";
import type { Category } from "@shared/schemas/categories";
import type { Settings, SettingsInput } from "@shared/schemas/settings";
import { api } from "./client";

export const settingsApi = {
  get: () => api.get<Settings>("/settings"),
  update: (input: SettingsInput) => api.put<Settings>("/settings", input),
  updateCommission: (categoryId: number, defaultCommissionRate: number | null) =>
    api.put<Category>(`/settings/categories/${categoryId}/commission`, { defaultCommissionRate }),
  // Ya existía en el servidor (módulo auth); aquí solo se le da pantalla
  changePassword: (role: Role, newPassword: string) => api.put<void>("/auth/password", { role, newPassword }),
};