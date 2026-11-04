import { useMemo, useState } from "react";
import type { PaymentMethod, Role } from "@shared/constants";
import type { SaleDetail, SaleFilters, SaleSummary } from "@shared/schemas/sales";
import { errorMessage } from "@/api/client";
import { salesApi } from "@/api/sales";
import { useCatalog } from "@/catalog/CatalogContext";
import Pagination from "@/components/Pagination";
import { type DateRange, DateRangePicker, presetRange } from "@/components/dates";
import { Badge, Button, Card, Icon, IconButton, Modal, Select, TextArea, TextInput } from "@/components/ui";
import { useApiQuery } from "@/hooks/useApiQuery";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { formatQuetzales, SALE_TIME_FORMAT } from "@/lib/format";
import DeletedSalesPanel from "@/pages/sales/DeletedSalesPanel";
import EditSaleModal from "@/pages/sales/EditSaleModal";
import InvoicePreview from "@/pages/sales/InvoicePreview";
import type { SaleRecord } from "@/temporal/localStore";

const PAGE_SIZE = 20;
const SEARCH_DELAY_MS = 300;

export default function SalesHistory({
  role,
  sales: localSales,
  onInvoice,
  onUpdateSale,
  onDeleteSale,
}: {
  role: Role;
  sales?: SaleRecord[];
  onInvoice?: () => void;
  onUpdateSale?: (updated: SaleRecord) => void;
  onDeleteSale?: (id: string | number) => void;
}) {
  const { sellers, sellerNames, categories, categoryNames } = useCatalog();
  const isAdmin = role === "Administrador";

  const [page, setPage] = useState(1);
  const [dateRange, setDateRange] = useState<DateRange>(() => presetRange("Últimos 30 días"));
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebouncedValue(searchQuery, SEARCH_DELAY_MS);
  const [filterSeller, setFilterSeller] = useState("Todos los vendedores");
  const [filterCategory, setFilterCategory] = useState("Todas las categorías");
  const [filterPayment, setFilterPayment] = useState("Cualquier pago");
  const [filterStatus, setFilterStatus] = useState("Cualquier estado");
  const [filterPendingCommission, setFilterPendingCommission] = useState(false);

  // Estados para ver factura, editar y eliminar
  const [selectedInvoiceSale, setSelectedInvoiceSale] = useState<SaleDetail | null>(null);
  const [loadingInvoiceId, setLoadingInvoiceId] = useState<number | null>(null);
  const [editingSaleId, setEditingSaleId] = useState<number | null>(null);
  const [deletingSaleId, setDeletingSaleId] = useState<number | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  // Historial de ventas eliminadas (solo Administrador)
  const [showDeleted, setShowDeleted] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  /** Envuelve un setter de filtro: al cambiar lo que se busca se vuelve a la primera página. */
  const onFilter =
    <Value,>(setValue: (value: Value) => void) =>
    (value: Value) => {
      setPage(1);
      setValue(value);
    };

  const toIsoDate = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  // Filtros activos para el backend
  const activeFilters = useMemo<SaleFilters>(() => {
    const filters: SaleFilters = {};
    if (isAdmin) {
      if (dateRange.start && dateRange.end) {
        filters.from = toIsoDate(dateRange.start);
        filters.to = toIsoDate(dateRange.end);
      }

      if (filterSeller !== "Todos los vendedores") {
        const found = sellers.find((s) => s.fullName === filterSeller);
        if (found) filters.sellerId = found.id;
      }
      if (filterCategory !== "Todas las categorías") {
        const found = categories.find((c) => c.name === filterCategory);
        if (found) filters.categoryId = found.id;
      }
      if (filterPayment !== "Cualquier pago") {
        filters.paymentMethod = filterPayment as PaymentMethod;
      }
      if (filterStatus === "Facturada") {
        filters.isInvoiced = true;
      } else if (filterStatus === "No facturada") {
        filters.isInvoiced = false;
      }
      if (filterPendingCommission) {
        filters.hasPendingCommission = true;
      }
    }
    if (debouncedSearch.trim()) {
      filters.search = debouncedSearch.trim();
    }
    return filters;
  }, [
    isAdmin,
    dateRange,
    filterSeller,
    filterCategory,
    filterPayment,
    filterStatus,
    filterPendingCommission,
    debouncedSearch,
    sellers,
    categories,
  ]);

  const queryKey = useMemo(() => JSON.stringify(activeFilters), [activeFilters]);

  // Cargar ventas de la API
  const {
    data: salesPage,
    loading,
    error,
    refetch,
  } = useApiQuery(`sales:list:${queryKey}:${page}`, () => salesApi.list(activeFilters, page, PAGE_SIZE), { poll: !showDeleted });

  // Contador de facturas del mes (punto 5)
  const { data: invoiceUsage } = useApiQuery("sales:invoice-usage", salesApi.invoiceUsage, { poll: !showDeleted });

  const displayedSales: SaleSummary[] = salesPage?.items ?? [];

  const handleOpenInvoice = async (saleId: number) => {
    setLoadingInvoiceId(saleId);
    try {
      const detail = await salesApi.get(saleId);
      setSelectedInvoiceSale(detail);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al cargar la factura";
      setFeedbackMessage(msg);
      if (onInvoice) onInvoice();
    } finally {
      setLoadingInvoiceId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingSaleId) return;
    setIsDeleting(true);
    try {
      await salesApi.delete(deletingSaleId, deleteReason.trim() || undefined);
      if (onDeleteSale) onDeleteSale(deletingSaleId);
      setFeedbackMessage(`Venta #${deletingSaleId} eliminada correctamente.`);
      await refetch();
    } catch (err: unknown) {
      setFeedbackMessage(errorMessage(err, "Error al eliminar la venta"));
    } finally {
      setIsDeleting(false);
      // Se cierra también si falló: el aviso se muestra en la página, detrás del modal
      setDeletingSaleId(null);
      setDeleteReason("");
    }
  };

  if (isAdmin && showDeleted) {
    return <DeletedSalesPanel onBack={() => setShowDeleted(false)} />;
  }

  // Si está viendo una factura
  if (selectedInvoiceSale) {
    return (
      <InvoicePreview
        saleId={selectedInvoiceSale.id}
        saleDate={selectedInvoiceSale.soldAt}
        items={selectedInvoiceSale.items.map((it) => ({
          id: it.id,
          desc: it.description,
          cat: it.categoryName,
          qty: it.quantity,
          price: it.unitPrice,
        }))}
        paymentMethod={selectedInvoiceSale.paymentMethod}
        seller={selectedInvoiceSale.sellerName}
        clientId={selectedInvoiceSale.client?.taxId || "CF"}
        idType={selectedInvoiceSale.client?.taxIdType || "NIT"}
        clientName={selectedInvoiceSale.client?.name || "Consumidor Final"}
        clientAddress={selectedInvoiceSale.client?.address || "Ciudad"}
        total={selectedInvoiceSale.total}
        observations={selectedInvoiceSale.observations}
        onClose={() => setSelectedInvoiceSale(null)}
      />
    );
  }

  return (
    <div className="screen-stack">
      <div className="hero-row">
        <div>
          <div className="section-title">{isAdmin ? "Historial de ventas" : "Ventas de hoy"}</div>
          <div className="muted">
            {isAdmin
              ? "Consulta, filtra y administra las ventas registradas con bitácora de auditoría."
              : "Ventas registradas durante el turno de hoy."}
          </div>
        </div>
        <div className="row-actions" style={{ alignItems: "center" }}>
        {isAdmin && (
          <Button variant="secondary" icon="trash" onClick={() => setShowDeleted(true)}>
            Ventas eliminadas
          </Button>
        )}
        {invoiceUsage && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "6px 14px",
              background: invoiceUsage.isAlert ? "rgba(245, 158, 11, 0.15)" : "var(--color-surface)",
              border: `1px solid ${invoiceUsage.isAlert ? "var(--color-warning, #f59e0b)" : "var(--color-line)"}`,
              borderRadius: "var(--radius-sm)",
              fontSize: "13px",
            }}
          >
            <Icon name="file" size="sm" />
            <span>
              Facturas del mes: <strong>{invoiceUsage.issued} / {invoiceUsage.limit}</strong>
            </span>
            <Badge tone={invoiceUsage.isAlert ? "warning" : "neutral"}>
              {invoiceUsage.percent}%
            </Badge>
          </div>
        )}
        </div>
      </div>

      {feedbackMessage && (
        <div
          className="cf-warning"
          style={{
            background: feedbackMessage.includes("correctamente")
              ? "rgba(16, 185, 129, 0.15)"
              : "var(--color-danger-soft, #fee2e2)",
            borderColor: feedbackMessage.includes("correctamente")
              ? "var(--color-success, #10b981)"
              : "var(--color-danger, #ef4444)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>{feedbackMessage}</span>
          <button
            type="button"
            className="icon-button"
            onClick={() => setFeedbackMessage(null)}
            aria-label="Cerrar aviso"
          >
            ×
          </button>
        </div>
      )}

      {invoiceUsage?.isAlert && (
        <div
          className="cf-warning"
          role="alert"
          style={{ background: "rgba(245, 158, 11, 0.15)", borderColor: "var(--color-warning, #f59e0b)" }}
        >
          <Icon name="bell" size="sm" />
          <span>
            <strong>Alerta mensual de facturación:</strong> Se ha alcanzado el {invoiceUsage.percent}% del límite de facturas ({invoiceUsage.issued} de {invoiceUsage.limit} emitidas). Quedan {invoiceUsage.remaining} disponibles este mes.
          </span>
        </div>
      )}

      {isAdmin && (
        <Card className="history-filters">
          <TextInput
            placeholder="Buscar por producto, cliente, vendedor..."
            icon="search"
            value={searchQuery}
            onChange={onFilter(setSearchQuery)}
          />
          <DateRangePicker value={dateRange} onChange={onFilter(setDateRange)} />
          <Select
            value={filterSeller}
            options={["Todos los vendedores", ...sellerNames]}
            onChange={onFilter(setFilterSeller)}
          />
          <Select
            value={filterCategory}
            options={["Todas las categorías", ...categoryNames]}
            onChange={onFilter(setFilterCategory)}
          />
          <Select
            value={filterPayment}
            options={["Cualquier pago", "Efectivo", "Transferencia", "Tarjeta"]}
            onChange={onFilter(setFilterPayment)}
          />
          <Select
            value={filterStatus}
            options={["Cualquier estado", "Facturada", "No facturada"]}
            onChange={onFilter(setFilterStatus)}
          />
          <label className="filter-check">
            <input
              type="checkbox"
              checked={filterPendingCommission}
              onChange={(e) => onFilter(setFilterPendingCommission)(e.target.checked)}
            />
            <span>Comisión pendiente</span>
          </label>
        </Card>
      )}

      <Card>
        {loading && displayedSales.length === 0 ? (
          <div className="empty-state-box">
            <div className="empty-state-icon">
              <Icon name="history" />
            </div>
            <div className="empty-state-title">Cargando ventas del servidor...</div>
          </div>
        ) : displayedSales.length === 0 ? (
          <div className="empty-state-box">
            <div className="empty-state-icon">
              <Icon name="history" />
            </div>
            <div className="empty-state-title">No hay ventas registradas</div>
            <div className="empty-state-desc">
              {error
                ? error.message
                : "No se encontraron ventas que coincidan con los filtros aplicados."}
            </div>
          </div>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Fecha / Hora</th>
                    <th>Productos</th>
                    <th>Vendedor</th>
                    <th>Pago</th>
                    <th>Monto</th>
                    {isAdmin && <th>Comisión</th>}
                    <th>Factura</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedSales.map((row) => (
                    <tr key={row.id}>
                      <td>
                        {new Date(row.soldAt).toLocaleDateString("es-GT")} ·{" "}
                        {SALE_TIME_FORMAT.format(new Date(row.soldAt))}
                      </td>
                      <td>
                        <strong>{row.itemsSummary}</strong>
                        {row.clientName && (
                          <div style={{ fontSize: "11px", color: "var(--color-muted)" }}>
                            Cliente: {row.clientName}
                          </div>
                        )}
                      </td>
                      <td>{row.sellerName}</td>
                      <td>{row.paymentMethod}</td>
                      <td>
                        <strong>{formatQuetzales(row.total)}</strong>
                      </td>
                      {isAdmin && (
                        <td>
                          {row.hasPendingCommission ? (
                            <span className="badge badge-neutral">Pendiente</span>
                          ) : (
                            formatQuetzales(row.commissionAmount ?? 0)
                          )}
                        </td>
                      )}
                      <td>
                        <Badge tone={row.isInvoiced ? "success" : "neutral"}>
                          {row.isInvoiced ? "Facturada" : "No facturada"}
                        </Badge>
                      </td>
                      <td>
                        <div className="row-actions">
                          {row.isInvoiced && (
                            <IconButton
                              icon="file"
                              label="Ver e imprimir factura"
                              onClick={() => {
                                handleOpenInvoice(row.id);
                              }}
                            />
                          )}
                          {isAdmin && row.isClosed && <Badge tone="neutral">Período cerrado</Badge>}
                          {isAdmin && !row.isClosed && (
                            <>
                              <IconButton
                                icon="edit"
                                label="Editar venta"
                                onClick={() => setEditingSaleId(row.id)}
                              />
                              <IconButton
                                icon="trash"
                                label="Eliminar venta"
                                onClick={() => setDeletingSaleId(row.id)}
                              />
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {salesPage && (
              <Pagination
                page={salesPage.page}
                pageSize={salesPage.pageSize}
                totalItems={salesPage.totalItems}
                totalPages={salesPage.totalPages}
                onPageChange={setPage}
                noun="ventas"
              />
            )}
          </>
        )}
      </Card>

      {/* Modal para editar venta (solo Administrador) */}
      {editingSaleId && (
        <EditSaleModal
          open={true}
          saleId={editingSaleId}
          onClose={() => setEditingSaleId(null)}
          onSuccess={() => {
            setFeedbackMessage("Venta actualizada exitosamente y registrada en bitácora.");
            refetch();
          }}
        />
      )}

      {/* Modal para confirmar eliminación (solo Administrador) */}
      <Modal
        open={deletingSaleId !== null}
        title="Eliminar venta"
        onClose={() => {
          setDeletingSaleId(null);
          setDeleteReason("");
        }}
        onConfirm={handleConfirmDelete}
        confirmLabel={isDeleting ? "Eliminando..." : "Sí, eliminar"}
        confirmDisabled={isDeleting}
      >

        <p style={{ margin: "0 0 12px 0", fontSize: "14px" }}>
          ¿Estás seguro de que deseas eliminar la venta <strong>#{deletingSaleId}</strong>?
        </p>
        <div style={{ marginBottom: "12px" }}>
          <TextArea
            label="Motivo (opcional)"
            placeholder="Ej. Se registró dos veces, el cliente canceló la compra..."
            value={deleteReason}
            onChange={setDeleteReason}
          />
        </div>
        <div style={{ fontSize: "12px", color: "var(--color-muted)", background: "var(--color-surface-soft)", padding: "10px", borderRadius: "var(--radius-sm)", display: "flex", alignItems: "center", gap: "6px" }}>
          <Icon name="lock" size="sm" />
          <span>
            Esta acción no se puede deshacer y quedará registrada en la bitácora de auditoría con tu usuario y rol de Administrador. Si la venta salió de una orden de taller, la orden vuelve a "Lista para entregar" para cobrarse de nuevo.
          </span>
        </div>
      </Modal>
    </div>
  );
}
