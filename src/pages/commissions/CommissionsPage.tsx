import { useState } from "react";
import { useCatalog } from "@/catalog/CatalogContext";
import { type DateRange, DateRangePicker, fmtRangeLong, presetRange } from "@/components/dates";
import { Button, Card, Icon, Select } from "@/components/ui";
import { formatQuetzales } from "@/lib/format";
import AssignCommissionModal from "@/pages/sales/AssignCommissionModal";
import type { SaleRecord } from "@/temporal/localStore";

export default function Commissions({
  sales,
  onUpdateSale,
}: {
  sales: SaleRecord[];
  onUpdateSale: (updated: SaleRecord) => void;
}) {
  const { sellerNames } = useCatalog();
  const [assignTarget, setAssignTarget] = useState<SaleRecord | null>(null);
  const [chosenSeller, setSelectedSeller] = useState("");
  const selectedSeller = chosenSeller || sellerNames[0] || "";
  const [dateRange, setDateRange] = useState<DateRange>(() => presetRange("Este mes"));

  const sellerSales = sales.filter((s) => s.seller === selectedSeller);
  const totalSold = sellerSales.reduce((acc, s) => acc + s.amount, 0);

  const totalAssignedCommission = sellerSales.reduce((acc, s) => {
    const val = parseFloat(s.commission.replace(/[^0-9.]/g, ""));
    return acc + (isNaN(val) ? 0 : val);
  }, 0);

  const pendingCommissionCount = sellerSales.filter((s) => s.commission === "Pendiente").length;
  const averageTicket = sellerSales.length > 0 ? totalSold / sellerSales.length : 0;

  const handleAssignCommission = (pct: string) => {
    if (!assignTarget) return;
    const calc = (assignTarget.amount * parseFloat(pct)) / 100;
    onUpdateSale({ ...assignTarget, commission: formatQuetzales(calc) });
    setAssignTarget(null);
  };

  return (
    <div className="screen-stack">
      <div className="hero-row">
        <div>
          <div className="section-title">Comisiones por vendedor</div>
          <div className="muted">Consulta el rendimiento y las comisiones generadas.</div>
        </div>
        <div className="inline-filters">
          <Select value={selectedSeller} options={sellerNames} onChange={setSelectedSeller} />
          <DateRangePicker value={dateRange} onChange={setDateRange} align="right" />
        </div>
      </div>

      <div className="comm-kpis">
        <Card>
          <span>Total vendido</span>
          <strong>{formatQuetzales(totalSold)}</strong>
          <small>{sellerSales.length} ventas</small>
        </Card>
        <Card>
          <span>Comisión asignada</span>
          <strong>{formatQuetzales(totalAssignedCommission)}</strong>
        </Card>
        <Card>
          <span>Ticket promedio</span>
          <strong>{formatQuetzales(averageTicket)}</strong>
        </Card>
        <Card className="comm-pending-kpi">
          <span>Comisiones pendientes</span>
          <strong>{pendingCommissionCount}</strong>
          <small>Por asignar</small>
        </Card>
      </div>

      <Card>
        <div className="card-heading">
          <div>
            <div className="card-title">Detalle de ventas — {selectedSeller}</div>
            <div className="muted small">{fmtRangeLong(dateRange)}</div>
          </div>
          {sellerSales.length > 0 && <Button variant="secondary" icon="download">Exportar</Button>}
        </div>

        {sellerSales.length === 0 ? (
          <div className="empty-state-box">
            <div className="empty-state-icon">
              <Icon name="coins" />
            </div>
            <div className="empty-state-title">Sin ventas para {selectedSeller}</div>
            <div className="empty-state-desc">Cuando se registren ventas asignadas a este vendedor, aparecerán aquí con su respectiva comisión.</div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Producto</th>
                  <th>Categoría</th>
                  <th>Pago</th>
                  <th>Monto</th>
                  <th>Comisión</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {sellerSales.map((sale) => (
                  <tr key={sale.id}>
                    <td>{sale.time}</td>
                    <td><strong>{sale.product}</strong></td>
                    <td>{sale.category}</td>
                    <td>{sale.paymentMethod}</td>
                    <td><strong>{formatQuetzales(sale.amount)}</strong></td>
                    <td>{sale.commission}</td>
                    <td>
                      {sale.commission === "Pendiente" ? (
                        <button
                          type="button"
                          className="assign-chip"
                          onClick={() => setAssignTarget(sale)}
                        >
                          Asignar
                        </button>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
