import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import type { Role } from "@shared/constants";
import type { Product } from "@shared/schemas/inventory";
import { ApiError } from "@/api/client";
import { inventoryApi } from "@/api/inventory";
import { useCatalog } from "@/catalog/CatalogContext";
import KpiCard from "@/components/KpiCard";
import Pagination from "@/components/Pagination";
import Segmented from "@/components/Segmented";
import { Badge, Button, Card, GlassToggle, Icon, IconButton, Select, TextInput } from "@/components/ui";
import { useApiQuery } from "@/hooks/useApiQuery";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { countLabel, formatQuetzales } from "@/lib/format";
import AdjustStockModal from "./AdjustStockModal";
import ProductDetailModal from "./ProductDetailModal";
import ProductFormModal from "./ProductFormModal";
import StockEntryModal from "./StockEntryModal";

const PAGE_SIZE = 20;
const ALL = "Todas";
const STATUS_FILTERS = { Activos: "activos", Inactivos: "inactivos", Todos: "todos" } as const;
type StatusLabel = keyof typeof STATUS_FILTERS;

// Inventario: productos con existencias, motos por unidad (chasis) y kárdex.
// El Empleado lo consulta para vender (sin costos); el Administrador lo administra.
export default function InventoryPage({ role }: { role: Role }) {
  const isAdmin = role === "Administrador";
  const { categories } = useCatalog();

  const [search, setSearch] = useState("");
  const [categoryName, setCategoryName] = useState(ALL);
  const [status, setStatus] = useState<StatusLabel>("Activos");
  const [lowOnly, setLowOnly] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search.trim(), 300);

  const [editing, setEditing] = useState<Product | null | undefined>(undefined);
  const [entryFor, setEntryFor] = useState<Product | null>(null);
  const [adjustFor, setAdjustFor] = useState<Product | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  // Aviso dentro de la página. Al desactivar, trae "Deshacer" para volver a activarlo en un clic
  const [notice, setNotice] = useState<{ text: string; tone: "ok" | "warning"; undo?: Product } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const filters = {
    search: debouncedSearch || undefined,
    categoryId: categories.find((c) => c.name === categoryName)?.id,
    status: STATUS_FILTERS[status],
    lowStock: lowOnly || undefined,
  };
  const { data, loading, error, refetch } = useApiQuery(`inventory:list:${JSON.stringify(filters)}:${page}`, () => inventoryApi.list(filters, page, PAGE_SIZE));
  const summary = useApiQuery("inventory:summary", () => (isAdmin ? inventoryApi.summary() : Promise.resolve(null)));
  const products = data?.items ?? [];

  const resetPage = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value);
    setPage(1);
  };

  const afterChange = async (message?: string) => {
    if (message) setNotice({ text: message, tone: "ok" });
    await Promise.all([refetch(), summary.refetch()]);
  };

  const toggleActive = async (product: Product, isActive: boolean) => {
    // El interruptor se mueve al instante, como los demás; en vez de preguntar antes, el aviso
    // de la página permite deshacerlo si fue un clic sin querer
    setActionError(null);
    try {
      await inventoryApi.setActive(product.id, isActive);
      await afterChange();
      setNotice(
        isActive
          ? { text: `"${product.name}" vuelve a ofrecerse al vender`, tone: "ok" }
          : { text: `"${product.name}" ya no se ofrece al vender. Sus existencias y su historial se conservan.`, tone: "warning", undo: product },
      );
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "No se pudo cambiar el estado");
    }
  };

  // Desde la campanita: ?bajas=1 abre la lista con solo las existencias bajas
  useEffect(() => {
    if (searchParams.get("bajas") !== "1") return;
    setLowOnly(true);
    setStatus("Activos");
    setPage(1);
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  const hasFilters = Boolean(filters.search || filters.categoryId || lowOnly || status !== "Activos");

  return (
    <div className="screen-stack">
      {/* El nombre de la pantalla ya está en la barra superior: aquí solo va la acción */}
      {isAdmin && (
        <div className="hero-row hero-actions">
          <Button icon="plus" onClick={() => setEditing(null)}>
            Agregar producto
          </Button>
        </div>
      )}

      {isAdmin && summary.data && (
        <div className="kpi-grid inventory-kpis">
          <KpiCard icon="box" label="Productos activos" value={String(summary.data.activeProducts)} foot={countLabel(summary.data.availableUnits, "moto disponible", "motos disponibles")} tone="orange" />
          <KpiCard
            icon="bell"
            label="Existencias bajas"
            value={String(summary.data.lowStock)}
            foot={summary.data.lowStock > 0 ? "En su mínimo o por debajo" : "Todo por encima del mínimo"}
            footWarning={summary.data.lowStock > 0}
            tone="red"
          />
          <KpiCard icon="trending" label="Agotados" value={String(summary.data.outOfStock)} foot="Productos activos sin existencias" tone="purple" />
          <KpiCard icon="coins" label="Valor del inventario" value={formatQuetzales(summary.data.stockValue)} foot="Existencias × costo registrado" tone="green" />
        </div>
      )}

      <Card>
        <div className="inventory-filters">
          <TextInput icon="search" placeholder="Buscar por nombre, código o chasis…" value={search} onChange={resetPage(setSearch)} />
          <Select value={categoryName} options={[ALL, ...categories.map((c) => c.name)]} onChange={resetPage(setCategoryName)} ariaLabel="Categoría" />
          {isAdmin && <Segmented options={Object.keys(STATUS_FILTERS)} value={status} onChange={(v) => resetPage(setStatus)(v as StatusLabel)} />}
          <label className="filter-check">
            <input type="checkbox" checked={lowOnly} onChange={(e) => resetPage(setLowOnly)(e.target.checked)} />
            <span>Solo existencias bajas</span>
          </label>
        </div>

        {notice && (
          <div className={`cf-warning inventory-notice${notice.tone === "warning" ? " is-warning" : ""}`} role="status">
            <Icon name={notice.tone === "warning" ? "bell" : "check"} size="sm" />
            <span>{notice.text}</span>
            {notice.undo && (
              <button type="button" className="picker-link" onClick={() => notice.undo && toggleActive(notice.undo, true)}>
                Deshacer
              </button>
            )}
            <button type="button" className="icon-button" onClick={() => setNotice(null)} aria-label="Cerrar aviso">×</button>
          </div>
        )}
        {(error || actionError) && <div className="cf-warning">{actionError ?? error?.message}</div>}

        {!loading && products.length === 0 && !error ? (
          <div className="empty-state-box">
            <div className="empty-state-icon">
              <Icon name="box" />
            </div>
            <div className="empty-state-title">{hasFilters ? "Ningún producto coincide con la búsqueda" : "Todavía no hay productos"}</div>
            <div className="empty-state-desc">
              {hasFilters ? "Prueba con otro nombre o quita los filtros." : isAdmin ? "Agrega el primer producto con el botón de arriba." : "El administrador todavía no ha cargado el inventario."}
            </div>
          </div>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Categoría</th>
                    <th className="num">Precio</th>
                    {isAdmin && <th className="num">Costo</th>}
                    <th>Existencias</th>
                    {isAdmin && <th>Estado</th>}
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => (
                    <tr key={product.id} className={product.isActive ? undefined : "row-muted"}>
                      <td className="cell-fill" title={product.name}>
                        <strong>{product.name}</strong>
                        <div className="muted small">
                          {[product.code, product.tracksUnits && "Por chasis"].filter(Boolean).join(" · ") || "Sin código"}
                        </div>
                      </td>
                      <td>
                        <Badge>{product.categoryName}</Badge>
                      </td>
                      <td className="num" style={{ whiteSpace: "nowrap" }}>{formatQuetzales(product.salePrice)}</td>
                      {isAdmin && <td className="num" style={{ whiteSpace: "nowrap" }}>{product.cost != null ? formatQuetzales(product.cost) : "—"}</td>}
                      <td>
                        <span className={`stock-pill${product.stock === 0 ? " is-out" : product.isLow ? " is-low" : ""}`}>
                          {product.stock}
                          {product.stock === 0 ? " · agotado" : product.isLow ? " · bajo" : ""}
                        </span>
                      </td>
                      {isAdmin && (
                        <td>
                          <GlassToggle checked={product.isActive} onChange={(checked) => toggleActive(product, checked)} label={product.isActive ? "Activo" : "Inactivo"} />
                        </td>
                      )}
                      <td>
                        <div className="row-actions">
                          <IconButton icon="eye" label={isAdmin ? "Ver unidades y kárdex" : "Ver detalle"} onClick={() => setDetailId(product.id)} />
                          {isAdmin && (
                            <>
                              <IconButton icon="plus" label="Registrar entrada" onClick={() => setEntryFor(product)} />
                              {!product.tracksUnits && <IconButton icon="settings" label="Ajustar por conteo" onClick={() => setAdjustFor(product)} />}
                              <IconButton icon="edit" label="Editar producto" onClick={() => setEditing(product)} />
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data && (
              <Pagination page={data.page} pageSize={data.pageSize} totalItems={data.totalItems} totalPages={data.totalPages} onPageChange={setPage} noun="productos" />
            )}
          </>
        )}
      </Card>

      {editing !== undefined && (
        <ProductFormModal
          product={editing}
          onClose={() => setEditing(undefined)}
          onSaved={async (saved) => {
            setEditing(undefined);
            await afterChange(editing ? `Se guardaron los cambios de "${saved.name}"` : `Se agregó "${saved.name}". Registra su primera entrada para tener existencias.`);
          }}
        />
      )}
      {entryFor && (
        <StockEntryModal
          product={entryFor}
          onClose={() => setEntryFor(null)}
          onSaved={async (expenseAmount) => {
            const name = entryFor.name;
            setEntryFor(null);
            await afterChange(
              expenseAmount ? `Se registró la entrada de "${name}" y el gasto de ${formatQuetzales(expenseAmount)} en Gastos` : `Se registró la entrada de "${name}"`,
            );
          }}
        />
      )}
      {adjustFor && (
        <AdjustStockModal
          product={adjustFor}
          onClose={() => setAdjustFor(null)}
          onSaved={async () => {
            const name = adjustFor.name;
            setAdjustFor(null);
            await afterChange(`Se ajustaron las existencias de "${name}"`);
          }}
        />
      )}
      {detailId !== null && <ProductDetailModal productId={detailId} isAdmin={isAdmin} onClose={() => setDetailId(null)} onChanged={() => afterChange()} />}
    </div>
  );
}
