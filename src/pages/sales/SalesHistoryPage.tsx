import { useState } from "react";
import type { Role } from "@shared/constants";
import { useCatalog } from "@/catalog/CatalogContext";
import { type DateRange, DateRangePicker, presetRange, startOfDay } from "@/components/dates";
import { Badge, Button, Card, Icon, IconButton, Select, TextInput } from "@/components/ui";
import { formatQuetzales } from "@/lib/format";
import AssignCommissionModal from "@/pages/sales/AssignCommissionModal";
import type { SaleRecord } from "@/temporal/localStore";

export default function SalesHistory({
  role,
  sales,
  onInvoice,
  onUpdateSale,
  onDeleteSale,
}: {
  role: Role;
  sales: SaleRecord[];
  onInvoice: () => void;
  onUpdateSale: (updated: SaleRecord) => void;
  onDeleteSale?: (id: string | number) => void;
}) {
  const { sellerNames, categoryNames } = useCatalog();
  const isAdmin = role === "Administrador";
  const [assignTarget, setAssignTarget] = useState<SaleRecord | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>(() => presetRange("Últimos 30 días"));
  const [searchQuery, setSearchQuery] = useState("");
  const [filterSeller, setFilterSeller] = useState("Todos los vendedores");
  const [filterCategory, setFilterCategory] = useState("Todas las categorías");
  const [filterPayment, setFilterPayment] = useState("Cualquier pago");
  const [filterStatus, setFilterStatus] = useState("Cualquier estado");
  const [filterPendingCommission, setFilterPendingCommission] = useState(false);

  const handleAssignCommission = (pct: string) => {
    if (!assignTarget) return;
    const calc = (assignTarget.amount * parseFloat(pct)) / 100;
    onUpdateSale({ ...assignTarget, commission: formatQuetzales(calc) });
    setAssignTarget(null);
  };

  const todayTimestamp = startOfDay(new Date()).getTime();
  const filteredSales = sales.filter((item) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const match = item.product.toLowerCase().includes(q) || item.seller.toLowerCase().includes(q);
      if (!match) return false;
    }
    if (filterSeller !== "Todos los vendedores" && item.seller !== filterSeller) return false;
    if (filterCategory !== "Todas las categorías" && item.category !== filterCategory) return false;
    if (filterPayment !== "Cualquier pago" && item.paymentMethod !== filterPayment) return false;
    if (filterStatus !== "Cualquier estado") {
      const isFact = filterStatus === "Facturada";
      if (item.invoiced !== isFact) return false;
    }
    if (filterPendingCommission && item.commission !== "Pendiente") return false;
    return true;
  });

  const displayedSales = isAdmin
    ? filteredSales
    : filteredSales.filter((s) => s.timestamp >= todayTimestamp);

  return (
    <div className="screen-stack">
      <div className="hero-row">
        <div>
          <div className="section-title">{isAdmin ? "Historial de ventas" : "Ventas de hoy"}</div>
          <div className="muted">
            {isAdmin
              ? "Consulta, filtra y administra las ventas registradas."
              : "Ventas registradas durante el turno de hoy."}
          </div>
        </div>
        {isAdmin && <Button icon="download" variant="secondary">Exportar</Button>}
      </div>

      {isAdmin && (
        <Card className="history-filters">
          <TextInput
            placeholder="Buscar por producto, vendedor..."
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
        {displayedSales.length === 0 ? (
          <div className="empty-state-box">
            <div className="empty-state-icon">
              <Icon name="history" />
            </div>
            <div className="empty-state-title">No hay ventas registradas</div>
            <div className="empty-state-desc">
              {sales.length === 0
                ? "Aún no se ha registrado ninguna venta en el sistema."
                : "No se encontraron ventas que coincidan con los filtros aplicados."}
            </div>
          </div>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {isAdmin ? (
                      <>
                        <th>Fecha / Hora</th>
                        <th>Producto</th>
                        <th>Categoría</th>
                        <th>Vendedor</th>
                        <th>Pago</th>
                        <th>Monto</th>
                        <th>Comisión</th>
                        <th>Factura</th>
                        <th>Acciones</th>
                      </>
                    ) : (
                      <>
                        <th>Hora</th>
                        <th>Producto</th>
                        <th>Categoría</th>
                        <th>Vendedor</th>
                        <th>Pago</th>
                        <th>Monto</th>
                        <th>Factura</th>
                        <th>Acciones</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {displayedSales.map((row) => (
                    <tr key={row.id} className={row.locked ? "locked-row" : ""}>
                      <td>{row.locked && <Icon name="lock" size="sm" />} {row.time}</td>
                      <td><strong>{row.product}</strong></td>
                      <td>{row.category}</td>
                      <td>{row.seller}</td>
                      <td>{row.paymentMethod}</td>
                      <td><strong>{formatQuetzales(row.amount)}</strong></td>
                      {isAdmin && (
                        <td>
                          {row.locked ? (
                            <span className="muted">{row.commission}</span>
                          ) : row.commission === "Pendiente" ? (
                            <button
                              type="button"
                              className="assign-chip"
                              onClick={() => setAssignTarget(row)}
                            >
                              Asignar
                            </button>
                          ) : (
                            row.commission
                          )}
                        </td>
                      )}
                      <td>
                        <Badge tone={row.invoiced ? "success" : "neutral"}>
                          {row.invoiced ? "Facturada" : "No facturada"}
                        </Badge>
                      </td>
                      <td>
                        {row.locked ? (
                          <Badge tone="neutral">Cerrado</Badge>
                        ) : (
                          <div className="row-actions">
                            {row.invoiced && (
                              <button
                                type="button"
                                className="icon-button"
                                title="Ver factura"
                                onClick={onInvoice}
                              >
                                <Icon name="file" size="sm" />
                              </button>
                            )}
                            {isAdmin && onDeleteSale && (
                              <IconButton
                                icon="trash"
                                label="Eliminar"
                                onClick={() => onDeleteSale(row.id)}
                              />
                            )}
                          </div>
                        )}
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

      {assignTarget && (
        <AssignCommissionModal
          open={true}
          saleProduct={assignTarget.product}
          saleAmount={assignTarget.amount}
          onClose={() => setAssignTarget(null)}
          onConfirm={handleAssignCommission}
        />
      )}
    </div>
  );
}
