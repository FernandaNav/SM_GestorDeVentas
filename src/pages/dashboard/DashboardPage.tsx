import { useMemo, useState } from "react";
import KpiCard from "@/components/KpiCard";
import { addMonths, fmtMonth, fmtMonthShort, startOfDay, startOfMonth } from "@/components/dates";
import { Button, Card, Icon, Select } from "@/components/ui";
import { formatQuetzales } from "@/lib/format";
import SalesTable, { type RecentSaleRow } from "@/pages/sales/SalesTable";

type SellerPerformance = { name: string; shortName: string; amount: number; salesCount: number; colorClass: string };
import type { ExpenseRecord, SaleRecord } from "@/temporal/localStore";

export default function Dashboard({
  sales,
  expenses,
  onNewSale,
  onHistory,
}: {
  sales: SaleRecord[];
  expenses: ExpenseRecord[];
  onNewSale: () => void;
  onHistory?: () => void;
}) {
  const [sellerMonth, setSellerMonth] = useState<"Este mes" | "Mes anterior">("Este mes");

  const sellerMonthLabel = fmtMonth(addMonths(new Date(), sellerMonth === "Este mes" ? 0 : -1));

  // Dynamic calculations from real sales and expenses state
  const computedMetrics = useMemo(() => {
    const now = new Date();
    const startOfCurrentDay = startOfDay(now).getTime();
    const startOfCurrentMonth = startOfMonth(now).getTime();

    const todaySalesList = sales.filter((s) => s.timestamp >= startOfCurrentDay);
    const monthSalesList = sales.filter((s) => s.timestamp >= startOfCurrentMonth);

    const todaySalesTotal = todaySalesList.reduce((acc, s) => acc + s.amount, 0);
    const monthSalesTotal = monthSalesList.reduce((acc, s) => acc + s.amount, 0);

    const monthCommissionsTotal = monthSalesList.reduce((acc, s) => {
      const parsed = parseFloat(s.commission.replace(/[^0-9.]/g, ""));
      return acc + (isNaN(parsed) ? 0 : parsed);
    }, 0);
    const pendingCommissionsCount = monthSalesList.filter((s) => s.commission === "Pendiente").length;

    const monthExpensesList = expenses.filter((e) => e.timestamp >= startOfCurrentMonth);
    const monthExpensesTotal = monthExpensesList.reduce((acc, e) => acc + e.amount, 0);

    const invoicedSalesCount = monthSalesList.filter((s) => s.invoiced).length;
    const invoiceLimit = 200;
    const availableInvoices = Math.max(0, invoiceLimit - invoicedSalesCount);
    const invoicePercentage = invoiceLimit > 0 ? Math.round((invoicedSalesCount / invoiceLimit) * 100) : 0;

    // Seller summary calculation from current sales
    const sellerSalesMap: Record<string, { amount: number; count: number }> = {};
    for (const sale of monthSalesList) {
      const sellerName = sale.seller || "General";
      if (!sellerSalesMap[sellerName]) {
        sellerSalesMap[sellerName] = { amount: 0, count: 0 };
      }
      sellerSalesMap[sellerName].amount += sale.amount;
      sellerSalesMap[sellerName].count += 1;
    }

    const colorClasses = ["bar-one", "bar-two", "bar-three"];
    const dynamicSellers: SellerPerformance[] = Object.entries(sellerSalesMap)
      .sort((a, b) => b[1].amount - a[1].amount)
      .map(([name, data], idx) => ({
        name,
        shortName: name.split(" ")[0],
        amount: data.amount,
        salesCount: data.count,
        colorClass: colorClasses[idx % colorClasses.length],
      }));

    const dynamicTotalSellerAmount = dynamicSellers.reduce((acc, s) => acc + s.amount, 0);
    const dynamicTotalSalesCount = dynamicSellers.reduce((acc, s) => acc + s.salesCount, 0);
    const dynamicAverageTicket = dynamicTotalSalesCount > 0 ? dynamicTotalSellerAmount / dynamicTotalSalesCount : 0;

    return {
      todaySalesTotal,
      todaySalesCount: todaySalesList.length,
      monthSalesTotal,
      monthSalesCount: monthSalesList.length,
      monthCommissionsTotal,
      pendingCommissionsCount,
      monthExpensesTotal,
      monthExpensesCount: monthExpensesList.length,
      invoicedSalesCount,
      invoiceLimit,
      availableInvoices,
      invoicePercentage,
      sellers: dynamicSellers,
      totalSellerAmount: dynamicTotalSellerAmount,
      totalSalesCount: dynamicTotalSalesCount,
      averageTicket: dynamicAverageTicket,
    };
  }, [sales, expenses]);

  // TEMPORAL: métricas calculadas con los datos locales. El módulo Reportes las reemplaza
  // por consultas SQL a la API (ver docs/MODULOS.md).
  const kpis = {
      todaySales: {
        value: computedMetrics.todaySalesTotal,
        comparisonText: computedMetrics.todaySalesCount > 0 ? `${computedMetrics.todaySalesCount} ventas registradas hoy` : "Sin ventas registradas hoy",
        isPositive: computedMetrics.todaySalesCount > 0,
        count: computedMetrics.todaySalesCount,
      },
      monthSales: {
        value: computedMetrics.monthSalesTotal,
        comparisonText: computedMetrics.monthSalesCount > 0 ? `${computedMetrics.monthSalesCount} ventas este mes` : "Sin ventas este mes",
        isPositive: computedMetrics.monthSalesCount > 0,
        count: computedMetrics.monthSalesCount,
      },
      monthCommissions: {
        value: computedMetrics.monthCommissionsTotal,
        pendingCount: computedMetrics.pendingCommissionsCount,
        text: computedMetrics.pendingCommissionsCount > 0 ? `${computedMetrics.pendingCommissionsCount} ventas con comisión pendiente` : "Sin comisiones pendientes",
      },
      monthExpenses: {
        value: computedMetrics.monthExpensesTotal,
        count: computedMetrics.monthExpensesCount,
        text: `${computedMetrics.monthExpensesCount} gastos registrados`,
      },
      invoices: {
        issued: computedMetrics.invoicedSalesCount,
        limit: computedMetrics.invoiceLimit,
        available: computedMetrics.availableInvoices,
        percentage: computedMetrics.invoicePercentage,
      },
    };

  const activeSellers = computedMetrics.sellers;

  const maxSellerAmount = Math.max(...activeSellers.map((s) => s.amount), 1);
  const totalSellerSalesCount = computedMetrics.totalSalesCount;
  const averageSellerTicket = computedMetrics.averageTicket;
  const invoiceUsagePercentage = kpis.invoices.percentage;

  const recentSalesRows: RecentSaleRow[] = sales.slice(0, 5).map((sale) => ({
      id: String(sale.id),
      time: sale.time,
      product: sale.product,
      category: sale.category,
      seller: sale.seller,
      paymentMethod: sale.paymentMethod,
      amount: sale.amount,
      commission: sale.commission,
      isInvoiced: sale.invoiced,
      invoiceStatus: sale.invoiced ? "Facturada" : "No facturada",
    }));

  return (
    <div className="screen-stack">
      <div className="hero-row">
        <div>
          <div className="section-title">Buenos días</div>
          <div className="muted">Este es el resumen de tu negocio al día de hoy.</div>
        </div>
        <Button icon="plus" onClick={onNewSale}>Nueva venta</Button>
      </div>

      <div className="kpi-grid">
        <KpiCard icon="cash" label="Ventas del día" value={formatQuetzales(kpis.todaySales.value)} foot={kpis.todaySales.comparisonText} tone="orange" />
        <KpiCard icon="trending" label="Ventas del mes" value={formatQuetzales(kpis.monthSales.value)} foot={kpis.monthSales.comparisonText} tone="blue" />
        <KpiCard icon="coins" label="Comisiones del mes" value={formatQuetzales(kpis.monthCommissions.value)} foot={kpis.monthCommissions.text} tone="purple" />
        <KpiCard icon="receipt" label="Gastos del mes" value={formatQuetzales(kpis.monthExpenses.value)} foot={kpis.monthExpenses.text} tone="red" />
        <KpiCard icon="file" label="Facturas emitidas" value={`${kpis.invoices.issued} / ${kpis.invoices.limit}`} foot={`${invoiceUsagePercentage}% del límite mensual`} tone="green" />
      </div>

      <div className="dashboard-grid">
        <Card className="chart-card">
          <div className="card-heading">
            <div>
              <div className="card-title">Ventas por vendedor</div>
              <div className="muted small">{sellerMonthLabel} · monto vendido</div>
            </div>
            <Select value={sellerMonth} options={["Este mes", "Mes anterior"]} onChange={(v) => setSellerMonth(v as any)} />
          </div>

          {activeSellers.length === 0 ? (
            <div className="empty-state-box">
              <div className="empty-state-icon">
                <Icon name="users" />
              </div>
              <div className="empty-state-title">Sin ventas registradas</div>
              <div className="empty-state-desc">Las ventas que registres con vendedor asignado aparecerán en esta gráfica.</div>
            </div>
          ) : (
            <>
              <div className="bar-chart">
                <div className="y-axis">
                  <span>{formatQuetzales(maxSellerAmount)}</span>
                  <span>{formatQuetzales(Math.round(maxSellerAmount * 0.66))}</span>
                  <span>{formatQuetzales(Math.round(maxSellerAmount * 0.33))}</span>
                  <span>Q 0</span>
                </div>
                <div className="bars">
                  {activeSellers.map((sellerItem) => (
                    <div className="bar-group" key={sellerItem.name}>
                      <span
                        className={`bar ${sellerItem.colorClass}`}
                        style={{ height: `${Math.max(15, Math.round((sellerItem.amount / maxSellerAmount) * 100))}%` }}
                      />
                      <strong>{formatQuetzales(sellerItem.amount)}</strong>
                      <small>{sellerItem.shortName}</small>
                    </div>
                  ))}
                </div>
              </div>
              <div className="chart-summary">
                <span><i className="dot orange" /> {totalSellerSalesCount} ventas totales</span>
                <span>Ticket promedio <strong>{formatQuetzales(averageSellerTicket)}</strong></span>
              </div>
            </>
          )}
        </Card>

        <Card className="chart-card">
          <div className="card-heading">
            <div>
              <div className="card-title">Ventas vs. gastos</div>
              <div className="muted small">Comportamiento durante el mes</div>
            </div>
            <div className="legend">
              <span><i className="dot orange" /> Ventas</span>
              <span><i className="dot gray" /> Gastos</span>
            </div>
          </div>

          {kpis.monthSales.value === 0 && kpis.monthExpenses.value === 0 ? (
            <div className="empty-state-box">
              <div className="empty-state-icon">
                <Icon name="chart" />
              </div>
              <div className="empty-state-title">Sin movimientos registrados</div>
              <div className="empty-state-desc">Registra ventas o compras operativas para comparar ingresos vs gastos del mes.</div>
            </div>
          ) : (
            <div className="line-chart">
              <div className="grid-lines"><span /><span /><span /><span /></div>
              <svg viewBox="0 0 520 190" preserveAspectRatio="none">
                <path className="area-path" d="M0 160 C55 145 75 120 120 126 S190 75 245 90 S310 30 365 58 S445 30 520 20 L520 190 L0 190Z" />
                <path className="sales-path" d="M0 160 C55 145 75 120 120 126 S190 75 245 90 S310 30 365 58 S445 30 520 20" />
                <path className="expense-path" d="M0 170 C80 165 110 155 165 160 S250 145 310 153 S390 138 440 145 S490 130 520 136" />
              </svg>
              <div className="x-labels">
                <span>1 {fmtMonthShort(new Date())}</span>
                <span>7 {fmtMonthShort(new Date())}</span>
                <span>14 {fmtMonthShort(new Date())}</span>
                <span>21 {fmtMonthShort(new Date())}</span>
                <span>Fin de mes</span>
              </div>
            </div>
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
            {onHistory && sales.length > 0 && <Button variant="ghost" onClick={onHistory}>Ver historial</Button>}
          </div>
          <SalesTable compact={true} salesData={recentSalesRows} onNewSale={onNewSale} />
        </Card>

        <Card className="invoice-limit">
          <div className="card-title">Control de facturas</div>
          <div className="radial" style={{ background: `conic-gradient(var(--color-primary) 0 ${invoiceUsagePercentage}%, var(--color-primary-soft) ${invoiceUsagePercentage}% 100%)` }}>
            <div>
              <strong>{invoiceUsagePercentage}%</strong>
              <span>utilizado</span>
            </div>
          </div>
          <div className="limit-stats">
            <div>
              <span>Emitidas</span>
              <strong>{kpis.invoices.issued}</strong>
            </div>
            <div>
              <span>Disponibles</span>
              <strong>{kpis.invoices.available}</strong>
            </div>
          </div>
          <div className="notice">
            <Icon name="file" size="sm" />
            <span>Te quedan {kpis.invoices.available} facturas disponibles este mes.</span>
          </div>
        </Card>
      </div>
    </div>
  );
}
