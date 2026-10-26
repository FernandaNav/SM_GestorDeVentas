import { useNavigate } from "react-router";
import { formatOrderNumber } from "@shared/schemas/workshop";
import { reportsApi } from "@/api/reports";
import { Badge, Button, Card, Icon, IconButton } from "@/components/ui";
import { useApiQuery } from "@/hooks/useApiQuery";
import { useCurrentDate } from "@/hooks/useCurrentDate";
import { paths } from "@/layout/navigation";
import { capitalize, LONG_DATE_FORMAT, SALE_TIME_FORMAT } from "@/lib/format";
import EmptyState from "@/pages/stats/EmptyState";
import { greeting } from "@/pages/stats/reportFormat";

// Inicio del Empleado: lo del día para el mostrador. El servidor ya lo manda sin montos
// (RNF 1.3) y se actualiza solo, así aparecen las ventas de la otra estación (RF 6.3).
export default function EmployeeHomePage() {
  const navigate = useNavigate();
  const today = useCurrentDate();
  const { data, loading, error } = useApiQuery("reports:home", reportsApi.home);

  const sales = data?.sales ?? [];
  const workshop = data?.workshop;

  return (
    <div className="screen-stack employee-home">
      <div className="hero-row employee-home-hero">
        <div>
          <div className="section-title">{greeting(today)}</div>
          <div className="muted">Este es el resumen de hoy, {capitalize(LONG_DATE_FORMAT.format(today))}.</div>
        </div>
        <Button icon="plus" className="employee-new-sale" onClick={() => navigate(paths.newSale)}>
          Nueva venta
        </Button>
      </div>

      {error && <div className="cf-warning">{error.message}</div>}

      {data?.invoiceAlert && (
        <div className="employee-invoice-warning" role="status">
          <Icon name="file" size="sm" />
          <span>Quedan pocas facturas disponibles este mes. Consulta con administración antes de facturar.</span>
        </div>
      )}

      <Card className="employee-sales-count">
        <div className="kpi-icon tone-orange">
          <Icon name="history" />
        </div>
        <div>
          <div className="kpi-label">Ventas registradas hoy</div>
          <div className="employee-count">{loading && !data ? "…" : sales.length}</div>
        </div>
      </Card>

      <Card>
        <div className="card-title">Ventas de hoy</div>
        {sales.length === 0 ? (
          <EmptyState icon="cash" title="Sin ventas registradas hoy" text="Las ventas que se registren durante el día aparecerán aquí." minHeight={140} />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Hora</th>
                  <th>Productos</th>
                  <th>Vendedor</th>
                  <th>Pago</th>
                  <th>Factura</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((sale) => (
                  <tr key={sale.id}>
                    <td>{SALE_TIME_FORMAT.format(new Date(sale.soldAt))}</td>
                    <td>
                      <strong>{sale.itemsSummary}</strong>
                    </td>
                    <td>{sale.sellerName}</td>
                    <td>{sale.paymentMethod}</td>
                    <td>
                      <div className="employee-invoice-cell">
                        <Badge tone={sale.isInvoiced ? "success" : "neutral"}>{sale.isInvoiced ? "Facturada" : "No facturada"}</Badge>
                        {sale.isInvoiced && <IconButton icon="file" label="Ver factura" onClick={() => navigate(paths.salesHistory)} />}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="employee-workshop">
        <div className="card-title">Taller hoy</div>
        <div className="employee-workshop-stats">
          <Card>
            <span>Recibidas</span>
            <strong>{workshop?.received ?? 0}</strong>
          </Card>
          <Card>
            <span>En reparación</span>
            <strong>{workshop?.inRepair ?? 0}</strong>
          </Card>
          <Card className="employee-ready-stat">
            <span>Listas para entregar</span>
            <strong>{workshop?.ready ?? 0}</strong>
          </Card>
        </div>
        <Card>
          <div className="card-title">Listas para entregar</div>
          {!workshop || workshop.readyOrders.length === 0 ? (
            <div className="empty-state-box" style={{ minHeight: 120 }}>
              <div className="empty-state-desc">No hay motocicletas listas para entrega en este momento.</div>
            </div>
          ) : (
            workshop.readyOrders.map((order) => (
              <div className="employee-ready-order" key={order.id}>
                <div>
                  <strong>{formatOrderNumber(order.id)}</strong>
                  <span>
                    {order.clientName} · {order.motorcycle}
                    {order.plate && ` · ${order.plate}`}
                  </span>
                </div>
                <Button variant="secondary" onClick={() => navigate(`${paths.workshop}?orden=${order.id}`)}>
                  Ver orden
                </Button>
              </div>
            ))
          )}
        </Card>
      </div>
    </div>
  );
}
