import { useState } from "react";
import { useCatalog } from "@/catalog/CatalogContext";
import KpiCard from "@/components/KpiCard";
import Segmented from "@/components/Segmented";
import { type DateRange, DateRangePicker, fmtRange, type Granularity, periodLabel, periodRange, PeriodStepper, presetRange, previousRange, shiftPeriod, startOfDay } from "@/components/dates";
import { Card, Icon, Select, Toggle } from "@/components/ui";
import { formatQuetzales } from "@/lib/format";
import type { ExpenseRecord, SaleRecord, WorkshopOrder } from "@/temporal/localStore";

export const STATS_TABS = ["Ventas", "Vendedores", "Categorías", "Ventas vs. gastos", "Taller"];

export default function Stats({
  sales,
  expenses,
  orders,
}: {
  sales: SaleRecord[];
  expenses: ExpenseRecord[];
  orders: WorkshopOrder[];
}) {
  const { sellerNames, categoryNames } = useCatalog();
  const [activeTab, setActiveTab] = useState("Ventas");
  const [periodGranularity, setPeriodGranularity] = useState<Granularity | "Personalizado">("Mensual");
  const [anchorDate, setAnchorDate] = useState(() => startOfDay(new Date()));
  const [customRange, setCustomRange] = useState<DateRange>(() => presetRange("Últimos 30 días"));
  const [selectedPayment, setSelectedPayment] = useState("Todos");
  const [selectedSeller, setSelectedSeller] = useState("Todos");
  const [selectedCategory, setSelectedCategory] = useState("Todas");
  const [compareWithPrevious, setCompareWithPrevious] = useState(true);

  const today = startOfDay(new Date());
  const isCustom = periodGranularity === "Personalizado";
  const range = isCustom ? customRange : periodRange(periodGranularity, anchorDate);
  const label = isCustom ? fmtRange(customRange) : periodLabel(periodGranularity, anchorDate);
  const prevLabel = isCustom || periodGranularity === "Diario" ? fmtRange(previousRange(range)) : periodLabel(periodGranularity, shiftPeriod(periodGranularity, anchorDate, -1));

  // Dynamic calculations from real sales
  const totalSalesAmount = sales.reduce((acc, s) => acc + s.amount, 0);
  const totalTransactionsCount = sales.length;
  const averageTicket = totalTransactionsCount > 0 ? totalSalesAmount / totalTransactionsCount : 0;
  const invoicedCount = sales.filter((s) => s.invoiced).length;

  return (
    <div className="screen-stack">
      <Card className="report-filters">
        <div>
          <div className="field-label">Período</div>
          <Segmented
            options={["Diario", "Semanal", "Mensual", "Anual", "Personalizado"]}
            value={periodGranularity}
            onChange={(v) => setPeriodGranularity(v as Granularity | "Personalizado")}
          />
          {isCustom ? (
            <div className="period-range-row">
              <DateRangePicker value={customRange} onChange={setCustomRange} />
            </div>
          ) : (
            <PeriodStepper
              label={label}
              onPrev={() => setAnchorDate(shiftPeriod(periodGranularity, anchorDate, -1))}
              onNext={() => setAnchorDate(shiftPeriod(periodGranularity, anchorDate, 1))}
              nextDisabled={periodRange(periodGranularity, shiftPeriod(periodGranularity, anchorDate, 1)).start > today}
              onReset={() => setAnchorDate(today)}
              resetDisabled={range.start <= today && today <= range.end}
            />
          )}
        </div>
        <Select label="Pago" value={selectedPayment} options={["Todos", "Efectivo", "Transferencia", "Tarjeta"]} onChange={setSelectedPayment} />
        <Select label="Vendedor" value={selectedSeller} options={["Todos", ...sellerNames]} onChange={setSelectedSeller} />
        <Select label="Categoría" value={selectedCategory} options={["Todas", ...categoryNames]} onChange={setSelectedCategory} />
        <Toggle checked={compareWithPrevious} onChange={setCompareWithPrevious} label={`Comparar con ${prevLabel}`} />
      </Card>

      <div className="stats-tabs">
        {STATS_TABS.map((t) => (
          <button
            key={t}
            type="button"
            className={`stats-tab${activeTab === t ? " active" : ""}`}
            onClick={() => setActiveTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {activeTab === "Ventas" && (
        <div className="screen-stack">
          <div className="kpi-grid">
            <KpiCard icon="cash" label="Total vendido" value={formatQuetzales(totalSalesAmount)} foot={`${totalTransactionsCount} transacciones`} tone="orange" />
            <KpiCard icon="trending" label="Ticket promedio" value={formatQuetzales(averageTicket)} foot="Promedio por venta" tone="blue" />
            <KpiCard icon="history" label="Transacciones" value={String(totalTransactionsCount)} foot="Ventas realizadas" tone="purple" />
            <KpiCard icon="file" label="Facturas emitidas" value={String(invoicedCount)} foot="Emitidas con FEL" tone="green" />
          </div>
          <Card className="chart-card wide">
            <div className="card-heading">
              <div>
                <div className="card-title">Ventas en el tiempo</div>
                <div className="muted small">{label}</div>
              </div>
            </div>
            {sales.length === 0 ? (
              <div className="empty-state-box">
                <div className="empty-state-icon"><Icon name="chart" /></div>
                <div className="empty-state-title">Sin datos para graficar</div>
                <div className="empty-state-desc">Las ventas registradas en el período se graficarán automáticamente aquí.</div>
              </div>
            ) : (
              <div className="line-chart tall">
                <div className="grid-lines"><span /><span /><span /><span /></div>
                <svg viewBox="0 0 800 210" preserveAspectRatio="none">
                  <path className="area-path" d="M0 180 C80 155 120 170 190 130 S300 110 380 120 S500 60 590 80 S710 35 800 45 L800 210 L0 210Z" />
                  <path className="sales-path" d="M0 180 C80 155 120 170 190 130 S300 110 380 120 S500 60 590 80 S710 35 800 45" />
                </svg>
              </div>
            )}
          </Card>
        </div>
      )}

      {activeTab === "Vendedores" && (
        <Card className="chart-card wide">
          <div className="card-heading">
            <div>
              <div className="card-title">Ventas por vendedor</div>
              <div className="muted small">{label}</div>
            </div>
          </div>
          {sales.length === 0 ? (
            <div className="empty-state-box">
              <div className="empty-state-icon"><Icon name="users" /></div>
              <div className="empty-state-title">Sin registros de ventas</div>
              <div className="empty-state-desc">No hay datos de vendedores en este período.</div>
            </div>
          ) : (
            <div className="bar-chart">
              <div className="bars" style={{ width: "100%", justifyContent: "space-around" }}>
                {sellerNames.map((sellerName) => {
                  const sellerSalesList = sales.filter((s) => s.seller === sellerName);
                  const amount = sellerSalesList.reduce((acc, s) => acc + s.amount, 0);
                  return (
                    <div className="bar-group" key={sellerName}>
                      <span className="bar bar-one" style={{ height: amount > 0 ? "70%" : "5%" }} />
                      <strong>{formatQuetzales(amount)}</strong>
                      <small>{sellerName.split(" ")[0]} · {sellerSalesList.length} vtas</small>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Card>
      )}

      {activeTab === "Categorías" && (
        <Card className="chart-card wide">
          <div className="card-heading">
            <div>
              <div className="card-title">Ventas por categoría</div>
              <div className="muted small">{label}</div>
            </div>
          </div>
          {sales.length === 0 ? (
            <div className="empty-state-box">
              <div className="empty-state-icon"><Icon name="receipt" /></div>
              <div className="empty-state-title">Sin registros por categoría</div>
              <div className="empty-state-desc">Registra ventas para ver la distribución porcentual.</div>
            </div>
          ) : (
            <div className="donut-layout">
              <div className="donut">
                <div>
                  <strong>{formatQuetzales(totalSalesAmount)}</strong>
                  <span>Total</span>
                </div>
              </div>
              <div className="donut-legend">
                {categoryNames.map((cat, i) => {
                  const catSales = sales.filter((s) => s.category === cat);
                  const catAmount = catSales.reduce((acc, s) => acc + s.amount, 0);
                  const colors = ["orange", "blue", "purple", "gray", "red"];
                  return (
                    <span key={cat}>
                      <i className={`dot ${colors[i % colors.length]}`} /> {cat}{" "}
                      <strong>{formatQuetzales(catAmount)}</strong>
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </Card>
      )}

      {activeTab === "Ventas vs. gastos" && (
        <Card className="chart-card wide">
          <div className="card-heading">
            <div>
              <div className="card-title">Ventas vs. gastos</div>
              <div className="muted small">Comparativa de ingresos y gastos operativos</div>
            </div>
            <div className="legend">
              <span><i className="dot orange" /> Ventas ({formatQuetzales(totalSalesAmount)})</span>
              <span><i className="dot gray" /> Gastos ({formatQuetzales(expenses.reduce((acc, e) => acc + e.amount, 0))})</span>
            </div>
          </div>
          {sales.length === 0 && expenses.length === 0 ? (
            <div className="empty-state-box">
              <div className="empty-state-icon"><Icon name="chart" /></div>
              <div className="empty-state-title">Sin movimientos registrados</div>
              <div className="empty-state-desc">Registra transacciones para visualizar el balance financiero.</div>
            </div>
          ) : (
            <div className="vg-bars" style={{ minHeight: 180, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div className="muted small">Gráfica actualizada con los movimientos registrados.</div>
            </div>
          )}
        </Card>
      )}

      {activeTab === "Taller" && (
        <div className="screen-stack">
          <div className="kpi-grid">
            <KpiCard icon="wrench" label="Órdenes activas" value={String(orders.filter((o) => o.status !== "Entregada").length)} foot="En proceso" tone="orange" />
            <KpiCard icon="cash" label="Ingresos taller" value={formatQuetzales(orders.filter((o) => o.status === "Entregada").reduce((acc, o) => acc + o.cost, 0))} foot="Órdenes cobradas" tone="blue" />
            <KpiCard icon="trending" label="Órdenes completadas" value={String(orders.filter((o) => o.status === "Entregada").length)} foot="Entregadas" tone="purple" />
          </div>
        </div>
      )}
    </div>
  );
}
