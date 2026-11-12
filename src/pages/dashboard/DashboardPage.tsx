import { useState } from "react";
import { useNavigate } from "react-router";
import { INVOICE_LIMIT_ENABLED } from "@shared/constants";
import type { DashboardSummary } from "@shared/schemas/reports";
import { fromApiDay, reportsApi } from "@/api/reports";
import KpiCard from "@/components/KpiCard";
import { addMonths, fmtMonth } from "@/components/dates";
import { Badge, Button, Card, Icon, Select } from "@/components/ui";
import { useApiQuery } from "@/hooks/useApiQuery";
import { countLabel, formatQuetzales, SALE_TIME_FORMAT } from "@/lib/format";
import { paths } from "@/layout/navigation";
import EmptyState from "@/pages/stats/EmptyState";
import { bucketLabel, bucketTick, greeting } from "@/pages/stats/reportFormat";
import { BarList, formatChange, LineChart, LineLegend, percentChange } from "@/pages/stats/charts";

const SELLER_MONTHS = ["Este mes", "Mes anterior"] as const;
// Las ventas recientes son de hace poco: el año y el día de la semana solo le quitan espacio a la tabla
const DAY_MONTH_FORMAT = new Intl.DateTimeFormat("es-GT", { day: "numeric", month: "short" });

// Dashboard del Administrador (RNF 4.1): todo viene calculado del servidor en una sola
// consulta y se actualiza solo cada 10 s, así refleja lo que registra el mostrador.
export default function DashboardPage() {
  const navigate = useNavigate();
  const [sellerMonth, setSellerMonth] = useState<(typeof SELLER_MONTHS)[number]>("Este mes");
  const { data, loading, error } = useApiQuery("reports:dashboard", reportsApi.dashboard);

  if (!data) {
    return (
      <div className="screen-stack">
        <Hero onNewSale={() => navigate(paths.newSale)} />
        {error ? <div className="cf-warning">{error.message}</div> : loading && <Card className="rpt-loading">Cargando el resumen…</Card>}
      </div>
    );
  }

  const today = fromApiDay(data.today);
  const { todaySales, monthSales, previousMonthSales, commissions, expenses, invoices, workshop } = data;
  const monthChange = percentChange(monthSales.total, previousMonthSales.total);
  const invoicePercent = invoices.limit > 0 ? Math.round((invoices.issued / invoices.limit) * 100) : 0;
  const invoiceAlert = INVOICE_LIMIT_ENABLED && invoicePercent >= invoices.alertPercent;
  const available = Math.max(0, invoices.limit - invoices.issued);

  const sellers = sellerMonth === "Este mes" ? data.sellers.currentMonth : data.sellers.previousMonth;
  const sellersTotal = sellers.reduce((sum, s) => sum + s.total, 0);
  const sellersCount = sellers.reduce((sum, s) => sum + s.salesCount, 0);
  const hasMovements = data.dailySeries.some((point) => point.sales > 0 || point.expenses > 0);

  return (
    <div className="screen-stack">
      <Hero onNewSale={() => navigate(paths.newSale)} />

      {commissions.pendingItems > 0 && (
        <div className="comm-pending-banner" role="status">
          <Icon name="coins" size="sm" />
          <span>
            Hay {countLabel(commissions.pendingSales, "venta", "ventas")} de este mes con comisión pendiente de asignar.
          </span>
          <button type="button" className="forgot-link" style={{ background: "none", border: 0 }} onClick={() => navigate(paths.commissions)}>
            Asignar comisiones
          </button>
        </div>
      )}

      <div className="kpi-grid">
        <KpiCard
          icon="cash"
          label="Ventas del día"
          value={formatQuetzales(todaySales.total)}
          foot={todaySales.count > 0 ? `${countLabel(todaySales.count, "venta registrada", "ventas registradas")} hoy` : "Sin ventas registradas hoy"}
          tone="orange"
        />
        <KpiCard
          icon="trending"
          label={`Ventas de ${fmtMonth(today).split(" ")[0].toLowerCase()}`}
          value={formatQuetzales(monthSales.total)}
          foot={
            monthChange === null
              ? `${countLabel(monthSales.count, "venta", "ventas")} este mes`
              : `${formatChange(monthSales.total, previousMonthSales.total)} vs. mismos días del mes anterior`
          }
          tone="blue"
        />
        <KpiCard
          icon="coins"
          label="Comisiones del mes"
          value={formatQuetzales(commissions.total)}
          foot={commissions.pendingItems > 0 ? `${countLabel(commissions.pendingItems, "artículo", "artículos")} con comisión pendiente` : "Sin comisiones pendientes"}
          tone="purple"
        />
        <KpiCard icon="receipt" label="Gastos del mes" value={formatQuetzales(expenses.total)} foot={countLabel(expenses.count, "gasto registrado", "gastos registrados")} tone="red" />
        <KpiCard
          icon="file"
          label="Facturas emitidas"
          value={INVOICE_LIMIT_ENABLED ? `${invoices.issued} / ${invoices.limit}` : String(invoices.issued)}
          foot={
            !INVOICE_LIMIT_ENABLED
              ? "En lo que va del mes"
              : invoiceAlert
              ? `Atención: ${countLabel(available, "disponible", "disponibles")} este mes`
              : `${countLabel(available, "disponible", "disponibles")} · ${invoicePercent} % del límite`
          }
          footWarning={invoiceAlert}
          tone="green"
        />
      </div>

      <div className="dashboard-grid">
        <Card className="chart-card">
          <div className="card-heading">
            <div>
              <div className="card-title">Ventas por vendedor</div>
              <div className="muted small">{fmtMonth(addMonths(today, sellerMonth === "Este mes" ? 0 : -1))} · monto vendido</div>
            </div>
            <Select value={sellerMonth} options={[...SELLER_MONTHS]} onChange={(value) => setSellerMonth(value as typeof sellerMonth)} />
          </div>
          {sellers.length === 0 ? (
            <EmptyState icon="users" title="Sin ventas en este mes" text="Las ventas que se registren con vendedor asignado aparecerán aquí." />
          ) : (
            <>
              <BarList
                rows={sellers.map((s) => ({
                  key: s.sellerId,
                  label: s.sellerName,
                  detail: `${countLabel(s.salesCount, "venta", "ventas")} · comisión ${formatQuetzales(s.commissionTotal)}`,
                  value: s.total,
                }))}
              />
              <div className="chart-summary">
                <span>{countLabel(sellersCount, "venta total", "ventas totales")}</span>
                <span>
                  Ticket promedio <strong>{formatQuetzales(sellersCount > 0 ? sellersTotal / sellersCount : 0)}</strong>
                </span>
              </div>
            </>
          )}
        </Card>

        <Card className="chart-card">
          <div className="card-heading">
            <div>
              <div className="card-title">Ventas vs. gastos</div>
              <div className="muted small">Por día, del 1 al {today.getDate()} de {fmtMonth(today).split(" ")[0].toLowerCase()}</div>
            </div>
            <LineLegend series={[{ name: "Ventas", kind: "sales" }, { name: "Gastos", kind: "expense" }]} />
          </div>
          {!hasMovements ? (
            <EmptyState icon="chart" title="Sin movimientos este mes" text="Registra ventas o gastos para comparar ingresos y egresos del mes." />
          ) : (
            <LineChart
              height={200}
              labels={data.dailySeries.map((p) => bucketTick(p.bucket, "day"))}
              tooltipLabels={data.dailySeries.map((p) => bucketLabel(p.bucket, "day"))}
              series={[
                { name: "Ventas", kind: "sales", values: data.dailySeries.map((p) => p.sales) },
                { name: "Gastos", kind: "expense", values: data.dailySeries.map((p) => p.expenses) },
              ]}
            />
          )}
        </Card>
      </div>

      <div className="bottom-grid">
        <Card>
          <div className="card-heading">
            <div>
              <div className="card-title">Ventas recientes</div>
              <div className="muted small">Últimos movimientos registrados</div>
            </div>
            {data.recentSales.length > 0 && (
              <Button variant="ghost" onClick={() => navigate(paths.salesHistory)}>
                Ver historial
              </Button>
            )}
          </div>
          {data.recentSales.length === 0 ? (
            <EmptyState icon="receipt" title="No hay ventas registradas aún" text="Las ventas que registres se mostrarán aquí." />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Fecha / hora</th>
                    <th>Productos</th>
                    <th>Vendedor</th>
                    <th>Pago</th>
                    <th className="num">Monto</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentSales.map((sale) => (
                    <tr key={sale.id}>
                      <td>
                        {DAY_MONTH_FORMAT.format(new Date(sale.soldAt))} · {SALE_TIME_FORMAT.format(new Date(sale.soldAt))}
                      </td>
                      <td className="cell-fill" title={sale.itemsSummary}>
                        <strong>{sale.itemsSummary}</strong>
                      </td>
                      <td className="cell-name" title={sale.sellerName}>{sale.sellerName}</td>
                      <td>{sale.paymentMethod}</td>
                      <td className="num">
                        <strong>{formatQuetzales(sale.total)}</strong>
                      </td>
                      <td>
                        <Badge tone={sale.isInvoiced ? "success" : "neutral"}>{sale.isInvoiced ? "Facturada" : "No facturada"}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <WorkshopSummaryCard workshop={workshop} onOpen={() => navigate(paths.workshop)} />
      </div>
    </div>
  );
}

function WorkshopSummaryCard({ workshop, onOpen }: { workshop: DashboardSummary["workshop"]; onOpen: () => void }) {
  const rows = [
    { label: "Recibidas", count: workshop.received, color: "--color-text" },
    { label: "En reparación", count: workshop.inRepair, color: "--color-warning" },
    { label: "Listas para entregar", count: workshop.ready, color: "--color-success" },
    { label: "Entregadas hoy", count: workshop.deliveredToday, color: "--color-blue" },
  ];
  const activeOrders = workshop.received + workshop.inRepair + workshop.ready;

  return (
    <Card>
      <div className="card-heading">
        <div>
          <div className="card-title">Taller</div>
          <div className="muted small">{countLabel(activeOrders, "orden activa", "órdenes activas")}</div>
        </div>
        <Button variant="ghost" onClick={onOpen}>
          Ver taller
        </Button>
      </div>
      <ul className="workshop-summary">
        {rows.map((row) => (
          <li key={row.label}>
            <span>{row.label}</span>
            <strong style={{ color: `var(${row.color})` }}>{row.count}</strong>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Hero({ onNewSale }: { onNewSale: () => void }) {
  return (
    <div className="hero-row">
      <div className="section-title">{greeting()}</div>
      <Button icon="plus" onClick={onNewSale}>
        Nueva venta
      </Button>
    </div>
  );
}
