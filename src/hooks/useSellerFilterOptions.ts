import { useMemo } from "react";
import { staffApi } from "@/api/staff";
import { useApiQuery } from "@/hooks/useApiQuery";

/** Vendedores para filtrar consultas: incluye a los inactivos, porque sus ventas pasadas siguen ahí. */
export function useSellerFilterOptions() {
  const { data: staff } = useApiQuery("staff:sellers:all", () => staffApi.list({ type: "Vendedor" }), { poll: false });
  return useMemo(
    () => (staff ?? []).map((member) => ({ id: member.id, label: member.isActive ? member.fullName : `${member.fullName} (inactivo)` })),
    [staff],
  );
}
