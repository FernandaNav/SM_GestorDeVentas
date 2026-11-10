import { useMemo } from "react";
import { categoriesApi } from "@/api/categories";
import { useApiQuery } from "@/hooks/useApiQuery";

/** Categorías para filtrar consultas: incluye las inactivas, porque sus ventas pasadas siguen ahí. */
export function useCategoryFilterOptions() {
  const { data: categories } = useApiQuery("categories:filter", categoriesApi.list, { poll: false });
  return useMemo(
    () => (categories ?? []).map((category) => ({ id: category.id, label: category.isActive ? category.name : `${category.name} (inactiva)` })),
    [categories],
  );
}
