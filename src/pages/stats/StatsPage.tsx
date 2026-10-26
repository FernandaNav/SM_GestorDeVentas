import { useState } from "react";
import { PAYMENT_METHODS, type PaymentMethod, type SaleItemOrigin } from "@shared/constants";
import type { SeriesPoint, StatsBucket, StatsFilters, StatsPeriod } from "@shared/schemas/reports";
import { reportsApi, toApiDay } from "@/api/reports";
import { useCatalog } from "@/catalog/CatalogContext";
import KpiCard from "@/components/KpiCard";
import Segmented from "@/components/Segmented";
import {
  type DateRange,
  DateRangePicker,
  fmtRange,
  type Granularity,
  periodLabel,
  periodRange,
  PeriodStepper,
  presetRange,
  previousRange,
  shiftPeriod,
  startOfDay,
} from "@/components/dates";
import { Card, Select, Toggle } from "@/components/ui";
import { useApiQuery } from "@/hooks/useApiQuery";
import { formatQuetzales } from "@/lib/format";
import { BarList, formatChange, LineChart, LineLegend, type LineSeries, percentChange, StackBar } from "./charts";
import EmptyState from "./EmptyState";
import { bucketLabel, bucketTick } from "./reportFormat";

const TABS = ["Ventas", "Vendedores", "Categorías", "Ventas vs. gastos", "Ventas vs. taller"] as const;
type Tab = (typeof TABS)[number];
type PeriodOption = Granularity | "Personalizado";

const ALL = "Todos";
const ORIGIN_LABELS: Record<SaleItemOrigin, string> = {
  venta: "Ventas de mostrador",
  taller_servicio: "Servicios de taller",
  taller_repuesto: "Repuestos de taller",
};

// Estadísticas (RF 4.1 a 4.5). La pantalla solo arma el período y los filtros; las sumas
// las hace el servidor. Comparar pide el período anterior en la misma consulta.
export default function StatsPage() {
  const { sellers, categories } = useCatalog();
  const [activeTab, setActiveTab] = useState<Tab>("Ventas");
  const [granularity, setGranularity] = useState<PeriodOption>("Mensual");
  const [anchorDate, setAnchorDate] = useState(() => startOfDay(new Date()));
  const [customRange, setCustomRange] = useState<DateRange>(() => presetRange("Últimos 30 días"));
  const [payment, setPayment] = useState(ALL);
  const [sellerName, setSellerName] = useState(ALL);
  const [categoryName, setCategoryName] = useState(ALL);
  const [compare, setCompare] = useState(true);

  const today = startOfDay(new Date());
  const isCustom = granularity === "Personalizado";
  const range = isCustom ? customRange : periodRange(granularity, anchorDate);
  const label = isCustom ? fmtRange(customRange) : periodLabel(granularity, anchorDate);
  // "Mes anterior" es el mes calendario completo (no los mismos días); en rangos libres y
  // por día se compara con el rango del mismo largo justo antes.
  const previous = isCustom || granularity === "Diario" ? previousRange(range) : periodRange(granularity, shiftPeriod(granularity, anchorDate, -1));
  const previousLabel = isCustom || granularity === "Diario" ? fmtRange(previous) : periodLabel(granularity, shiftPeriod(granularity, anchorDate, -1));

  const filters: StatsFilters = {
    from: toApiDay(range.start),
    to: toApiDay(range.end),
    paymentMethod: payment === ALL ? undefined : (payment as PaymentMethod),
    sellerId: sellers.find((s) => s.fullName === sellerName)?.id,
    categoryId: categories.find((c) => c.name === categoryName)?.id,
    ...(compare && { compareFrom: toApiDay(previous.start), compareTo: toApiDay(previous.end) }),
  };
  const { data, loading, error } = useApiQuery(`reports:stats:${JSON.stringify(filters)}`, () => reportsApi.stats(filters));
  const hasItemFilters = payment !== ALL || sellerName !== ALL || categoryName !== ALL;

  return (
    <div className="screen-stack">
      <Card className="report-filters">
        <div>
          <div className="field-label">Período</div>
          <Segmented
            options={["Diario", "Semanal", "Mensual", "Anual", "Personalizado"]}
            value={granularity}
            onChange={(value) => setGranularity(value as PeriodOption)}
          />
          {isCustom ? (
            <div className="period-range-row">
              <DateRangePicker value={customRange} onChange={setCustomRange} />
            </div>
          ) : (
            <PeriodStepper
              label={label}
              onPrev={() => setAnchorDate(shiftPeriod(granularity, anchorDate, -1))}
              onNext={() => setAnchorDate(shiftPeriod(granularity, anchorDate, 1))}
              nextDisabled={periodRange(granularity, shiftPeriod(granularity, anchorDate, 1)).start > today}
              onReset={() => setAnchorDate(today)}
              resetDisabled={range.start <= today && today <= range.end}
            />
          )}
        </div>
        <Select label="Pago" value={payment} options={[ALL, ...PAYMENT_METHODS]} onChange={setPayment} />
        <Select label="Vendedor" value={sellerName} options={[ALL, ...sellers.map((s) => s.fullName)]} onChange={setSellerName} />
        <Select label="Categoría" value={categoryName} options={[ALL, ...categories.map((c) => c.name)]} onChange={setCategoryName} />
        <Toggle checked={compare} onChange={setCompare} label={`Comparar con ${previousLabel}`} />
      </Card>

      <div className="stats-tabs" role="tablist">
        {TABS.map((tab) => (
          <button key={tab} type="button" role="tab" aria-selected={activeTab === tab} className={`stats-tab${activeTab === tab ? " active" : ""}`} onClick={() => setActiveTab(tab)}>
            {tab}
          </button>
        ))}
      </div>

      {error && <div className="cf-warning">{error.message}</div>}
      {!data && loading && <Card className="rpt-loading">Calculando estadísticas…</Card>}

      {data && (
        <>
          {activeTab === "Ventas" && <SalesTab current={data.current} previous={data.previous} bucket={data.bucket} label={label} previousLabel={previousLabel} />}
          {activeTab === "Vendedores" && <SellersTab current={data.current} previous={data.previous} label={label} />}
          {activeTab === "Categorías" && <CategoriesTab current={data.current} previous={data.previous} label={label} />}
          {activeTab === "Ventas vs. gastos" && (
            <ExpensesTab current={data.current} previous={data.previous} bucket={data.bucket} label={label} hasItemFilters={hasItemFilters} />
          )}
          {activeTab === "Ventas vs. taller" && (
            <WorkshopTab current={data.current} previous={data.previous} activeOrders={data.activeWorkshopOrders} label={label} />
          )}
        </>
      )}
    </div>
  );
}

/** Corta la línea en el período actual: los días que aún no pasan no son "cero ventas". */
function untilNow(series: SeriesPoint[], bucket: StatsBucket): SeriesPoint[] {
  const now = new Date();
  const limit = bucket === "hour" ? `${toApiDay(now)}T${String(now.getHours()).padStart(2, "0")}` : bucket === "day" ? toApiDay(now) : toApiDay(now).slice(0, 7);
  return series.filter((point) => point.bucket <= limit);
}

type TabProps = { current: StatsPeriod; previous: StatsPeriod | null; label: string };

/** Texto del pie de un KPI: la variación si se compara, o el detalle si no. */
const foot = (current: number, previous: number | undefined, otherwise: string) =>
  previous === undefined || previous === 0 ? otherwise : `${formatChange(current, previous)} vs. período anterior`;

/** Para gastos: KpiCard pinta de verde lo que empieza con "+", y aquí subir no es bueno. */
const expenseFoot = (current: number, previous: number | undefined, otherwise: string) => {
  const change = previous ? percentChange(current, previous) : null;
  if (change === null) return otherwise;
  return `${change > 0 ? "Subió" : "Bajó"} ${Math.abs(change).toFixed(1)} % vs. período anterior`;
};

function SalesTab({ current, previous, bucket, label, previousLabel }: TabProps & { bucket: "hour" | "day" | "month"; previousLabel: string }) {
  const t = current.totals;
  const p = previous?.totals;
  const series: LineSeries[] = [{ name: "Ventas", kind: "sales", values: untilNow(current.series, bucket).map((point) => point.sales) }];
  if (previous) {
    series.push({
      name: "Período anterior",
      kind: "compare",
      values: previous.series.map((point) => point.sales),
      pointLabels: previous.series.map((point) => bucketLabel(point.bucket, bucket)),
    });
  }

  return (
    <div className="screen-stack">
      <div className="kpi-grid">
        <KpiCard icon="cash" label="Total vendido" value={formatQuetzales(t.total)} foot={foot(t.total, p?.total, `${t.salesCount} transacciones`)} tone="orange" />
        <KpiCard icon="trending" label="Ticket promedio" value={formatQuetzales(t.averageTicket)} foot={foot(t.averageTicket, p?.averageTicket, "Promedio por venta")} tone="blue" />
        <KpiCard icon="history" label="Transacciones" value={String(t.salesCount)} foot={foot(t.salesCount, p?.salesCount, "Ventas realizadas")} tone="purple" />
        <KpiCard icon="file" label="Ventas facturadas" value={String(t.invoicedCount)} foot={foot(t.invoicedCount, p?.invoicedCount, `${t.salesCount - t.invoicedCount} sin factura`)} tone="green" />
        <KpiCard
          icon="coins"
          label="Comisiones"
          value={formatQuetzales(t.commissionTotal)}
          foot={t.pendingItems > 0 ? `${t.pendingItems} artículos pendientes de asignar` : "Todas asignadas"}
          tone="red"
        />
      </div>

      <Card className="chart-card wide">
        <div className="card-heading">
          <div>
            <div className="card-title">Ventas en el tiempo</div>
            <div className="muted small">
              {label} · por {bucket === "hour" ? "hora" : bucket === "day" ? "día" : "mes"}
              {previous && ` · comparado con ${previousLabel}`}
            </div>
          </div>
          {previous && <LineLegend series={series} />}
        </div>
        {t.salesCount === 0 && !p?.salesCount ? (
          <EmptyState icon="chart" title="Sin ventas en este período" text="Cambia el período o los filtros para ver otras fechas." />
        ) : (
          <LineChart
            height={240}
            labels={current.series.map((point) => bucketTick(point.bucket, bucket))}
            tooltipLabels={current.series.map((point) => bucketLabel(point.bucket, bucket))}
            series={series}
          />
        )}
      </Card>

      <Card>
        <div className="card-heading">
          <div>
            <div className="card-title">Por método de pago</div>
            <div className="muted small">
              {label}
              {previous && " · la marca gris es el período anterior"}
            </div>
          </div>
        </div>
        {current.byPaymentMethod.length === 0 ? (
          <EmptyState icon="cash" title="Sin ventas" text="No hay pagos registrados con estos filtros." minHeight={140} />
        ) : (
          <BarList
            showChange={!!previous}
            rows={PAYMENT_METHODS.map((method) => {
              const row = current.byPaymentMethod.find((r) => r.paymentMethod === method);
              const before = previous?.byPaymentMethod.find((r) => r.paymentMethod === method);
              return {
                key: method,
                label: method,
                detail: `${row?.salesCount ?? 0} ventas · ${t.total > 0 ? (((row?.total ?? 0) / t.total) * 100).toFixed(1) : "0.0"} % del total`,
                value: row?.total ?? 0,
                previous: previous ? (before?.total ?? 0) : undefined,
              };
            })}
          />
        )}
      </Card>
    </div>
  );
}

function SellersTab({ current, previous, label }: TabProps) {
  const total = current.totals.total;
  return (
    <div className="rpt-grid-2">
      <Card className="chart-card">
        <div className="card-heading">
          <div>
            <div className="card-title">Ventas por vendedor</div>
            <div className="muted small">{label}</div>
          </div>
        </div>
        {current.bySeller.length === 0 ? (
          <EmptyState icon="users" title="Sin ventas" text="No hay ventas de vendedores en este período." />
        ) : (
          <BarList
            showChange={!!previous}
            rows={current.bySeller.map((s) => ({
              key: s.sellerId,
              label: s.sellerName,
              detail: `${s.salesCount} ${s.salesCount === 1 ? "venta" : "ventas"}`,
              value: s.total,
              previous: previous ? (previous.bySeller.find((b) => b.sellerId === s.sellerId)?.total ?? 0) : undefined,
            }))}
          />
        )}
      </Card>
      <Card>
        <div className="card-title">Detalle</div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Vendedor</th>
                <th>Ventas</th>
                <th>Total</th>
                <th>Ticket prom.</th>
                <th>Comisión</th>
                <th>% del total</th>
              </tr>
            </thead>
            <tbody>
              {current.bySeller.map((s) => (
                <tr key={s.sellerId}>
                  <td>
                    <strong>{s.sellerName}</strong>
                  </td>
                  <td>{s.salesCount}</td>
                  <td>
                    <strong>{formatQuetzales(s.total)}</strong>
                  </td>
                  <td>{formatQuetzales(s.salesCount ? s.total / s.salesCount : 0)}</td>
                  <td>{formatQuetzales(s.commissionTotal)}</td>
                  <td>{total > 0 ? ((s.total / total) * 100).toFixed(1) : "0.0"} %</td>
                </tr>
              ))}
              {current.bySeller.length > 0 && (
                <tr className="rpt-table-total">
                  <td>Total</td>
                  <td>{current.totals.salesCount}</td>
                  <td>{formatQuetzales(total)}</td>
                  <td>{formatQuetzales(current.totals.averageTicket)}</td>
                  <td>{formatQuetzales(current.totals.commissionTotal)}</td>
                  <td>100 %</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function CategoriesTab({ current, previous, label }: TabProps) {
  const total = current.totals.total;
  return (
    <Card className="chart-card wide">
      <div className="card-heading">
        <div>
          <div className="card-title">Ventas por categoría</div>
          <div className="muted small">
            {label}
            {previous && " · la marca gris es el período anterior"}
          </div>
        </div>
      </div>
      {current.byCategory.length === 0 ? (
        <EmptyState icon="receipt" title="Sin ventas por categoría" text="Registra ventas para ver la distribución por categoría." />
      ) : (
        <BarList
          showChange={!!previous}
          rows={current.byCategory.map((c) => ({
            key: c.categoryId,
            label: c.categoryName,
            detail: `${c.quantity} ${c.quantity === 1 ? "unidad" : "unidades"} · ${total > 0 ? ((c.total / total) * 100).toFixed(1) : "0.0"} % del total`,
            value: c.total,
            previous: previous ? (previous.byCategory.find((b) => b.categoryId === c.categoryId)?.total ?? 0) : undefined,
          }))}
        />
      )}
    </Card>
  );
}

function ExpensesTab({ current, previous, bucket, label, hasItemFilters }: TabProps & { bucket: "hour" | "day" | "month"; hasItemFilters: boolean }) {
  const sales = current.totals.total;
  const expenses = current.expenses.total;
  const balance = sales - expenses;
  const previousBalance = previous ? previous.totals.total - previous.expenses.total : undefined;

  return (
    <div className="screen-stack">
      <div className="kpi-grid rpt-kpi-4">
        <KpiCard icon="cash" label="Ventas" value={formatQuetzales(sales)} foot={foot(sales, previous?.totals.total, `${current.totals.salesCount} ventas`)} tone="orange" />
        <KpiCard icon="receipt" label="Compras y gastos" value={formatQuetzales(expenses)} foot={expenseFoot(expenses, previous?.expenses.total, `${current.expenses.count} registros`)} tone="red" />
        <KpiCard icon="wallet" label="Ventas menos gastos" value={formatQuetzales(balance)} foot={foot(balance, previousBalance, balance >= 0 ? "Las ventas cubren los gastos" : "Los gastos superan las ventas")} tone="green" />
        <KpiCard
          icon="trending"
          label="Gastos por cada Q100 vendidos"
          value={sales > 0 ? formatQuetzales((expenses / sales) * 100) : "—"}
          foot="Proporción del período"
          tone="blue"
        />
      </div>

      {hasItemFilters && (
        <div className="cf-warning">
          Los gastos no tienen vendedor, método de pago ni categoría de producto: se muestran todos los del período, y las ventas con los filtros elegidos.
        </div>
      )}

      <div className="rpt-grid-2">
        <Card className="chart-card">
          <div className="card-heading">
            <div>
              <div className="card-title">Ventas vs. gastos</div>
              <div className="muted small">{label}</div>
            </div>
            <LineLegend series={[{ name: "Ventas", kind: "sales" }, { name: "Gastos", kind: "expense" }]} />
          </div>
          {bucket === "hour" ? (
            <div className="rpt-note">Los gastos se registran por día. Elige un período semanal o mayor para verlos en el tiempo.</div>
          ) : sales === 0 && expenses === 0 ? (
            <EmptyState icon="chart" title="Sin movimientos" text="No hay ventas ni gastos en este período." />
          ) : (
            <LineChart
              labels={current.series.map((point) => bucketTick(point.bucket, bucket))}
              tooltipLabels={current.series.map((point) => bucketLabel(point.bucket, bucket))}
              series={[
                { name: "Ventas", kind: "sales", values: untilNow(current.series, bucket).map((point) => point.sales) },
                { name: "Gastos", kind: "expense", values: untilNow(current.series, bucket).map((point) => point.expenses) },
              ]}
            />
          )}
        </Card>
        <Card>
          <div className="card-title">Gastos por categoría</div>
          <div className="muted small">{label}</div>
          {current.expenses.byCategory.length === 0 ? (
            <EmptyState icon="receipt" title="Sin gastos" text="No hay compras ni gastos registrados en este período." minHeight={160} />
          ) : (
            <BarList
              showChange={!!previous}
              lowerIsBetter
              rows={current.expenses.byCategory.map((e) => ({
                key: e.category,
                label: e.category,
                detail: `${e.count} ${e.count === 1 ? "registro" : "registros"}`,
                value: e.total,
                previous: previous ? (previous.expenses.byCategory.find((b) => b.category === e.category)?.total ?? 0) : undefined,
              }))}
            />
          )}
        </Card>
      </div>
    </div>
  );
}

function WorkshopTab({ current, previous, activeOrders, label }: TabProps & { activeOrders: number }) {
  const totalOf = (period: StatsPeriod | null, origin: SaleItemOrigin) => period?.byOrigin.find((o) => o.origin === origin)?.total ?? 0;
  const workshopTotal = totalOf(current, "taller_servicio") + totalOf(current, "taller_repuesto");
  const previousWorkshopTotal = previous ? totalOf(previous, "taller_servicio") + totalOf(previous, "taller_repuesto") : undefined;
  const segments = (Object.keys(ORIGIN_LABELS) as SaleItemOrigin[]).map((origin) => ({ label: ORIGIN_LABELS[origin], value: totalOf(current, origin) }));

  return (
    <div className="screen-stack">
      <div className="kpi-grid">
        <KpiCard icon="cash" label="Ventas de mostrador" value={formatQuetzales(totalOf(current, "venta"))} foot={foot(totalOf(current, "venta"), previous ? totalOf(previous, "venta") : undefined, "Motos, accesorios y más")} tone="orange" />
        <KpiCard icon="wrench" label="Ingresos de taller" value={formatQuetzales(workshopTotal)} foot={foot(workshopTotal, previousWorkshopTotal, "Servicios y repuestos cobrados")} tone="blue" />
        <KpiCard icon="history" label="Órdenes recibidas" value={String(current.workshop.ordersReceived)} foot={foot(current.workshop.ordersReceived, previous?.workshop.ordersReceived, "En el período")} tone="purple" />
        <KpiCard icon="check" label="Órdenes entregadas" value={String(current.workshop.ordersDelivered)} foot={foot(current.workshop.ordersDelivered, previous?.workshop.ordersDelivered, "Cobradas en el período")} tone="green" />
        <KpiCard icon="bike" label="Órdenes en proceso" value={String(activeOrders)} foot="Sin entregar, en este momento" tone="red" />
      </div>
      <Card>
        <div className="card-title">Ventas vs. taller</div>
        <div className="muted small">{label} · de dónde viene cada quetzal vendido</div>
        {segments.every((s) => s.value === 0) ? (
          <EmptyState icon="wrench" title="Sin ventas" text="No hay ventas ni cobros de taller en este período." minHeight={140} />
        ) : (
          <StackBar segments={segments} />
        )}
      </Card>
    </div>
  );
}
