import { useMemo, useState } from "react";
import type { PaymentMethod, Role } from "@shared/constants";
import type { SaleDetail, SaleFilters, SaleSummary } from "@shared/schemas/sales";
import { salesApi } from "@/api/sales";
import { useCatalog } from "@/catalog/CatalogContext";
import { type DateRange, DateRangePicker, presetRange } from "@/components/dates";
import { Badge, Button, Card, Icon, IconButton, Modal, Select, TextInput } from "@/components/ui";
import { useApiQuery } from "@/hooks/useApiQuery";
import { formatQuetzales, SALE_TIME_FORMAT } from "@/lib/format";
import EditSaleModal from "@/pages/sales/EditSaleModal";
import InvoicePreview from "@/pages/sales/InvoicePreview";
import type { SaleRecord } from "@/temporal/localStore";

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

  const [dateRange, setDateRange] = useState<DateRange>(() => presetRange("Últimos 30 días"));
  const [searchQuery, setSearchQuery] = useState("");
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
  const [isDeleting, setIsDeleting] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

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
    if (searchQuery.trim()) {
      filters.search = searchQuery.trim();
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
    searchQuery,
    sellers,
    categories,
  ]);

  const queryKey = useMemo(() => JSON.stringify(activeFilters), [activeFilters]);

  // Cargar ventas de la API
  const {
    data: serverSales,
    loading,
    error,
    refetch,
  } = useApiQuery(`sales:list:${queryKey}`, () => salesApi.list(activeFilters));

  // Contador de facturas del mes (punto 5)
  const { data: invoiceUsage } = useApiQuery("sales:invoice-usage", salesApi.invoiceUsage);

  // Usar datos del servidor o fallback local si no hay conexión
  const displayedSales: SaleSummary[] = serverSales ?? [];

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
      await salesApi.delete(deletingSaleId);
      if (onDeleteSale) onDeleteSale(deletingSaleId);
      setFeedbackMessage(`Venta #${deletingSaleId} eliminada correctamente.`);
      setDeletingSaleId(null);
      await refetch();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al eliminar la venta";
      setFeedbackMessage(msg);
    } finally {
      setIsDeleting(false);
    }
  };

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
            onChange={setSearchQuery}
          />
          <DateRangePicker value={dateRange} onChange={setDateRange} />
          <Select
            value={filterSeller}
            options={["Todos los vendedores", ...sellerNames]}
            onChange={setFilterSeller}
          />
          <Select
            value={filterCategory}
            options={["Todas las categorías", ...categoryNames]}
            onChange={setFilterCategory}
          />
          <Select
            value={filterPayment}
            options={["Cualquier pago", "Efectivo", "Transferencia", "Tarjeta"]}
            onChange={setFilterPayment}
          />
          <Select
            value={filterStatus}
            options={["Cualquier estado", "Facturada", "No facturada"]}
            onChange={setFilterStatus}
          />
          <label className="filter-check">
            <input
              type="checkbox"
              checked={filterPendingCommission}
              onChange={(e) => setFilterPendingCommission(e.target.checked)}
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
                          {isAdmin && (
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
            <div className="pagination">
              <span>Mostrando {displayedSales.length} ventas</span>
            </div>
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
        onClose={() => setDeletingSaleId(null)}
        onConfirm={handleConfirmDelete}
        confirmLabel={isDeleting ? "Eliminando..." : "Sí, eliminar"}
      >

        <p style={{ margin: "0 0 12px 0", fontSize: "14px" }}>
          ¿Estás seguro de que deseas eliminar la venta <strong>#{deletingSaleId}</strong>?
        </p>
        <div style={{ fontSize: "12px", color: "var(--color-muted)", background: "var(--color-surface-soft)", padding: "10px", borderRadius: "var(--radius-sm)", display: "flex", alignItems: "center", gap: "6px" }}>
          <Icon name="lock" size="sm" />
          <span>
            Esta acción no se puede deshacer y quedará registrada en la bitácora de auditoría con tu usuario y rol de Administrador.
          </span>
        </div>
      </Modal>
    </div>
  );
}
