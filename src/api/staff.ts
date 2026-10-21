import type { StaffType } from "@shared/constants";
import type { StaffInput, StaffMember } from "@shared/schemas/staff";
import { api, toQuery } from "./client";

export const staffApi = {
  list: (filters: { type?: StaffType; active?: boolean } = {}) => api.get<StaffMember[]>(`/staff${toQuery(filters)}`),
  create: (input: StaffInput) => api.post<StaffMember>("/staff", input),
  update: (id: number, input: StaffInput) => api.put<StaffMember>(`/staff/${id}`, input),
  setActive: (id: number, isActive: boolean) => api.patch<StaffMember>(`/staff/${id}/active`, { isActive }),
};
