import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Category } from "@shared/schemas/categories";
import type { StaffMember } from "@shared/schemas/staff";
import { categoriesApi } from "@/api/categories";
import { staffApi } from "@/api/staff";
import { useApiQuery } from "@/hooks/useApiQuery";

type Catalog = {
  /** Vendedores y mecánicos activos */
  sellers: StaffMember[];
  mechanics: StaffMember[];
  categories: Category[];
  // Atajos por nombre, para las pantallas que todavía guardan nombres en vez de ids
  sellerNames: string[];
  mechanicNames: string[];
  categoryNames: string[];
  /** Comisión sugerida por nombre de categoría ("" = se ingresa a mano) */
  defaultCommissions: Record<string, string>;
};

const CatalogContext = createContext<Catalog | null>(null);

// Listas que usan casi todas las pantallas (vendedores, mecánicos, categorías).
// Se cargan una sola vez para toda la app y se mantienen al día con la recarga automática.
export function CatalogProvider({ children }: { children: ReactNode }) {
  const { data: staff = [] } = useApiQuery("catalog/staff", () => staffApi.list({ active: true }));
  const { data: categories = [] } = useApiQuery("catalog/categories", categoriesApi.list);

  const catalog = useMemo<Catalog>(() => {
    const sellers = staff.filter((member) => member.type === "Vendedor");
    const mechanics = staff.filter((member) => member.type === "Mecánico");
    const activeCategories = categories.filter((category) => category.isActive);
    return {
      sellers,
      mechanics,
      categories: activeCategories,
      sellerNames: sellers.map((member) => member.fullName),
      mechanicNames: mechanics.map((member) => member.fullName),
      categoryNames: activeCategories.map((category) => category.name),
      defaultCommissions: Object.fromEntries(
        activeCategories.map((category) => [category.name, category.defaultCommissionRate?.toString() ?? ""]),
      ),
    };
  }, [staff, categories]);

  return <CatalogContext.Provider value={catalog}>{children}</CatalogContext.Provider>;
}

export function useCatalog(): Catalog {
  const context = useContext(CatalogContext);
  if (!context) throw new Error("useCatalog debe usarse dentro de <CatalogProvider>");
  return context;
}
