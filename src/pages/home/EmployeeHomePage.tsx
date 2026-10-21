import { startOfDay } from "@/components/dates";
import { Badge, Button, Card, Icon, IconButton } from "@/components/ui";
import { useCurrentDate } from "@/hooks/useCurrentDate";
import { capitalize, LONG_DATE_FORMAT } from "@/lib/format";
import type { SaleRecord, WorkshopOrder } from "@/temporal/localStore";

export default function EmployeeHome({
  sales,
  orders,
  onNewSale,
  onInvoice,
  onViewOrder,
}: {
  sales: SaleRecord[];
  orders: WorkshopOrder[];
  onNewSale: () => void;
  onInvoice: () => void;
  onViewOrder: (id: string) => void;
}) {
  const todayTimestamp = startOfDay(new Date()).getTime();
  const todaySales = sales.filter((s) => s.timestamp >= todayTimestamp).reverse();
  const activeOrders = orders.filter((order) => order.status !== "Entregada");
  const readyOrders = activeOrders.filter((order) => order.status === "Lista para entregar");
  const invoicesIssued = sales.filter((s) => s.invoiced).length;
  const monthlyInvoiceLimit = 200;

  const today = useCurrentDate();
  const formattedToday = capitalize(LONG_DATE_FORMAT.format(today));

  return (
    <div className="screen-stack employee-home">
      <div className="hero-row employee-home-hero">
        <div>
          <div className="section-title">Buenos días</div>
          <div className="muted">Este es el resumen de hoy, {formattedToday}.</div>
        </div>
        <Button icon="plus" className="employee-new-sale" onClick={onNewSale}>
          Nueva venta
        </Button>
      </div>

      <Card className="employee-sales-count">
        <div className="kpi-icon tone-orange">
          <Icon name="history" />
        </div>
        <div>
          <div className="kpi-label">Ventas registradas hoy</div>
          <div className="employee-count">{todaySales.length}</div>
        </div>
      </Card>

      <Card>
        <div className="card-title">Últimas ventas de hoy</div>
        {todaySales.length === 0 ? (
          <div className="empty-state-box" style={{ minHeight: 140 }}>
            <div className="empty-state-icon">
              <Icon name="cash" />
            </div>
            <div className="empty-state-title">Sin ventas registradas hoy</div>
            <div className="empty-state-desc">Las ventas que realices durante el día aparecerán aquí.</div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Hora</th>
                  <th>Producto</th>
                  <th>Vendedor</th>
                  <th>Factura</th>
                </tr>
              </thead>
              <tbody>
                {todaySales.map((sale) => (
                  <tr key={sale.id}>
                    <td>{sale.time.split(" · ")[1] || sale.time}</td>
                    <td><strong>{sale.product}</strong></td>
                    <td>{sale.seller}</td>
                    <td>
                      <div className="employee-invoice-cell">
                        <Badge tone={sale.invoiced ? "success" : "neutral"}>
                          {sale.invoiced ? "Facturada" : "No facturada"}
                        </Badge>
                        {sale.invoiced && (
                          <IconButton icon="file" label="Ver factura" onClick={onInvoice} />
                        )}
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
            <strong>{activeOrders.filter((order) => order.status === "Recibida").length}</strong>
          </Card>
          <Card>
            <span>En reparación</span>
            <strong>{activeOrders.filter((order) => order.status === "En reparación").length}</strong>
          </Card>
          <Card className="employee-ready-stat">
            <span>Listas para entregar</span>
            <strong>{readyOrders.length}</strong>
          </Card>
        </div>
        <Card>
          <div className="card-title">Listas para entregar</div>
          {readyOrders.length === 0 ? (
            <div className="empty-state-box" style={{ minHeight: 120 }}>
              <div className="empty-state-desc">No hay motocicletas listas para entrega en este momento.</div>
            </div>
          ) : (
            readyOrders.map((order) => (
              <div className="employee-ready-order" key={order.id}>
                <div>
                  <strong>{order.id}</strong>
                  <span>{order.client} · {order.moto}</span>
                </div>
                <Button variant="secondary" onClick={() => onViewOrder(order.id)}>
                  Ver orden
                </Button>
              </div>
            ))
          )}
        </Card>
      </div>

      {monthlyInvoiceLimit > 0 && invoicesIssued / monthlyInvoiceLimit > 0.8 && (
        <div className="employee-invoice-warning" role="status">
          <Icon name="file" size="sm" />
          <span>Quedan pocas facturas disponibles este mes. Consulta con administración antes de facturar.</span>
        </div>
      )}
    </div>
  );
}
