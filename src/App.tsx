import { type ReactNode, useEffect, useMemo, useState } from "react";
import { authService, type UserSession } from "./services/auth";
import { dashboardService, type DashboardSummary, type SellersSummary, type RecentSaleRow, type SellerPerformance } from "./services/dashboard";
import { salesStorage, type SaleRecord, type SaleItem, type ExpenseRecord, type WorkshopOrder, type WorkshopStatus } from "./services/sales";
import { Badge, Button, Card, Icon, IconButton, Modal, Select, TextArea, TextInput, Toggle, UnstyledButton, type IconName } from "./components/ui";
import { type DateRange, type Granularity, DatePicker, DateRangePicker, MonthPicker, PeriodStepper, addDays, addMonths, fmtDayMonth, fmtLongDay, fmtMonth, fmtMonthShort, fmtRange, fmtRangeLong, periodLabel, periodRange, presetRange, previousRange, shiftPeriod, startOfDay, startOfMonth } from "./components/dates";
import logo from "./imports/solomotos-logo.png";

type Role = "Administrador" | "Empleado";
type Accent = "orange" | "burgundy" | "navy";

const ACCENTS: { id: Accent; label: string; note: string; swatch: string }[] = [
  { id: "orange", label: "Naranja", note: "Color actual", swatch: "#ef4b23" },
  { id: "burgundy", label: "Burgundy", note: "Rojo vino", swatch: "#8c1d3a" },
  { id: "navy", label: "Azul marino", note: "Azul oscuro", swatch: "#1f4e8c" },
];

type Screen = "home" | "dashboard" | "sale" | "history" | "workshop" | "commissions" | "stats" | "expenses" | "sellers" | "closing" | "settings" | "invoice";

const adminNav: { id: Screen; label: string; icon: IconName }[] = [
  { id: "dashboard", label: "Dashboard", icon: "home" },
  { id: "sale", label: "Nueva venta", icon: "plus" },
  { id: "history", label: "Historial", icon: "history" },
  { id: "workshop", label: "Taller", icon: "wrench" },
  { id: "commissions", label: "Comisiones", icon: "coins" },
  { id: "stats", label: "Estadísticas", icon: "chart" },
  { id: "expenses", label: "Gastos", icon: "receipt" },
  { id: "sellers", label: "Personal", icon: "users" },
  { id: "closing", label: "Cierre", icon: "lock" },
  { id: "settings", label: "Configuración", icon: "settings" },
];

const employeeNav: { id: Screen; label: string; icon: IconName }[] = [
  { id: "home", label: "Inicio", icon: "home" },
  ...adminNav.filter((item) => ["sale", "history", "workshop"].includes(item.id)),
];

const screenTitles: Record<Screen, string> = {
  home: "Inicio",
  dashboard: "Dashboard",
  sale: "Registrar nueva venta",
  history: "Historial de ventas",
  workshop: "Taller",
  commissions: "Comisiones por vendedor",
  stats: "Estadísticas y reportes",
  expenses: "Compras y gastos",
  sellers: "Personal",
  closing: "Cierre de ventas",
  settings: "Configuración",
  invoice: "Vista previa de factura",
};

// ─── Number to Words Helpers ────────────────────────────────────────────────

const ONES = ["", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez", "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve"];
const TENS = ["", "", "veinte", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
const HUNDREDS = ["", "cien", "doscientos", "trescientos", "cuatrocientos", "quinientos", "seiscientos", "setecientos", "ochocientos", "novecientos"];

function intToWords(value: number): string {
  if (value === 0) return "cero";
  if (value < 20) return ONES[value];
  if (value < 100) {
    const tens = Math.floor(value / 10);
    const ones = value % 10;
    return tens === 2 && ones > 0 ? "veinti" + ONES[ones] : TENS[tens] + (ones ? " y " + ONES[ones] : "");
  }
  if (value === 100) return "cien";
  if (value < 1000) {
    const hundreds = Math.floor(value / 100);
    const remainder = value % 100;
    return (hundreds === 1 ? "ciento" : HUNDREDS[hundreds]) + (remainder ? " " + intToWords(remainder) : "");
  }
  if (value < 2000) {
    const remainder = value % 1000;
    return "mil" + (remainder ? " " + intToWords(remainder) : "");
  }
  if (value < 1000000) {
    const thousands = Math.floor(value / 1000);
    const remainder = value % 1000;
    return intToWords(thousands) + " mil" + (remainder ? " " + intToWords(remainder) : "");
  }
  return value.toString();
}

function numberToWords(amount: number): string {
  const integerPart = Math.floor(amount);
  const decimalPart = Math.round((amount - integerPart) * 100);
  const words = intToWords(integerPart);
  return (words.charAt(0).toUpperCase() + words.slice(1)) + ` quetzales con ${decimalPart.toString().padStart(2, "0")}/100`;
}

function formatQuetzales(amount: number): string {
  return "Q " + amount.toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Default Commissions ───────────────────────────────────────────────────

const DEFAULT_COMMISSIONS: Record<string, string> = {
  "Accesorio": "2.5",
  "Repuesto": "2.5",
  "Moto nueva": "",
  "Moto usada": "",
  "Otro": "",
};

const CATEGORIES = ["Moto nueva", "Moto usada", "Accesorio", "Repuesto", "Otro"];
const ACTIVE_SELLERS = ["María López", "Carlos Pérez", "José Méndez"];
const ACTIVE_MECHANICS = ["Mario Hernández", "Pedro Ajú", "Julio Tzul", "Érick Chávez"];

// ─── Navigation & Layout ───────────────────────────────────────────────────

function Sidebar({ active, role, onNavigate }: { active: Screen; role: Role; onNavigate: (screen: Screen) => void }) {
  const navItems = role === "Administrador" ? adminNav : employeeNav;
  return (
    <aside className="sidebar">
      <div className="brand">
        <img className="brand-logo" src={logo} alt="SoloMotos" />
        <div className="brand-subtitle">Sistema de Ventas</div>
      </div>
      <nav className="nav-list">
        {navItems.map((item) => (
          <UnstyledButton
            key={item.id}
            className={`nav-item ${active === item.id ? "active" : ""}`}
            onClick={() => onNavigate(item.id)}
          >
            <Icon name={item.icon} size="sm" />
            <span>{role === "Empleado" && item.id === "history" ? "Historial del día" : item.label}</span>
          </UnstyledButton>
        ))}
      </nav>
      <div className="sidebar-help">
        <div className="sidebar-help-icon">
          <Icon name="wrench" size="sm" />
        </div>
        <div>
          <strong>¿Necesitas ayuda?</strong>
          <span>Contacta al administrador</span>
        </div>
      </div>
    </aside>
  );
}

function useCurrentDate() {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  useEffect(() => {
    const timerId = setInterval(() => setCurrentDate(new Date()), 60_000);
    return () => clearInterval(timerId);
  }, []);
  return currentDate;
}

const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);
const LONG_DATE_FORMAT = new Intl.DateTimeFormat("es-GT", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const SHORT_DATE_FORMAT = new Intl.DateTimeFormat("es-GT", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const SALE_DATE_FORMAT = new Intl.DateTimeFormat("es-GT", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
const SALE_TIME_FORMAT = new Intl.DateTimeFormat("es-GT", { hour: "2-digit", minute: "2-digit", hour12: false });

function Header({
  screen,
  role,
  user,
  dark,
  onToggleDark,
  onLogout,
}: {
  screen: Screen;
  role: Role;
  user?: UserSession | null;
  dark: boolean;
  onToggleDark: () => void;
  onLogout: () => void;
}) {
  const today = useCurrentDate();
  const formattedLongDate = capitalize(LONG_DATE_FORMAT.format(today));

  return (
    <header className="topbar">
      <div className="topbar-heading">
        <div className="page-kicker">SoloMotos / {screenTitles[screen]}</div>
        <div className="page-title" title={screenTitles[screen]}>{screenTitles[screen]}</div>
      </div>
      <div className="top-actions">
        <div className="date-pill" title={formattedLongDate}>
          <Icon name="calendar" size="sm" />
          <span className="date-long">{formattedLongDate}</span>
          <span className="date-short">{capitalize(SHORT_DATE_FORMAT.format(today))}</span>
        </div>
        <IconButton icon="bell" label="Notificaciones" />
        <IconButton icon={dark ? "sun" : "moon"} label={dark ? "Tema claro" : "Tema oscuro"} onClick={onToggleDark} />
        <div className="user-menu" title={user?.email || role}>
          <div className="avatar">
            <Icon name="users" size="sm" />
          </div>
          <div className="user-menu-name">
            <strong>{user?.nombre || role}</strong>
            {user?.email && <span style={{ fontSize: "10px", color: "var(--color-muted)", display: "block" }}>{user.email}</span>}
          </div>
        </div>
        <IconButton icon="logout" label="Cerrar sesión" onClick={onLogout} />
      </div>
    </header>
  );
}

function KpiCard({
  icon,
  label,
  value,
  foot,
  tone = "dark",
}: {
  icon: IconName;
  label: string;
  value: string;
  foot: string;
  tone?: string;
}) {
  return (
    <Card className="kpi-card">
      <div className={`kpi-icon tone-${tone}`}>
        <Icon name={icon} />
      </div>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      <div className={`kpi-foot ${foot.startsWith("+") ? "positive" : ""}`}>{foot}</div>
    </Card>
  );
}

// ─── Dashboard Screen ───────────────────────────────────────────────────────

function Dashboard({
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
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [sellersSummary, setSellersSummary] = useState<SellersSummary | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const [sum, sellers] = await Promise.all([
        dashboardService.getSummary(),
        dashboardService.getSellers(sellerMonth === "Este mes" ? "current" : "previous"),
      ]);
      if (sum) setSummary(sum);
      if (sellers) setSellersSummary(sellers);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [sellerMonth]);

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

  // Use backend summary if valid and non-fallback; otherwise use real computed dynamic metrics (empty by default!)
  const isBackendReal = summary && !summary.isFallback;
  const kpis = isBackendReal
    ? summary.kpis
    : {
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

  const activeSellers: SellerPerformance[] = isBackendReal && sellersSummary?.sellers?.length
    ? sellersSummary.sellers
    : computedMetrics.sellers;

  const maxSellerAmount = Math.max(...activeSellers.map((s) => s.amount), 1);
  const totalSellerSalesCount = isBackendReal && sellersSummary ? sellersSummary.totalSales : computedMetrics.totalSalesCount;
  const averageSellerTicket = isBackendReal && sellersSummary ? sellersSummary.averageTicket : computedMetrics.averageTicket;
  const invoiceUsagePercentage = kpis.invoices.percentage;

  // Recent sales rows derived from state or backend
  const recentSalesRows: RecentSaleRow[] = isBackendReal && summary?.recentSales
    ? summary.recentSales
    : sales.slice(0, 5).map((sale) => ({
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
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div className="section-title">Buenos días</div>
            {isBackendReal && (
              <span style={{ fontSize: "11px", color: "#10b981", background: "rgba(16, 185, 129, 0.1)", padding: "3px 8px", borderRadius: "12px", display: "inline-flex", alignItems: "center", gap: "5px" }}>
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#10b981" }} />
                Supabase conectado
              </span>
            )}
          </div>
          <div className="muted">Este es el resumen de tu negocio al día de hoy.</div>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <Button variant="secondary" icon="history" onClick={() => loadData(true)}>
            {refreshing ? "Actualizando..." : "Actualizar"}
          </Button>
          <Button icon="plus" onClick={onNewSale}>Nueva venta</Button>
        </div>
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

// ─── Segmented Control Component ───────────────────────────────────────────

function Segmented({
  options,
  value,
  onChange,
  icons,
}: {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  icons?: IconName[];
}) {
  return (
    <div className="segmented">
      {options.map((option, index) => (
        <UnstyledButton
          key={option}
          className={value === option ? "selected" : ""}
          onClick={() => onChange(option)}
        >
          {icons && <Icon name={icons[index]} size="sm" />}
          <span>{option}</span>
        </UnstyledButton>
      ))}
    </div>
  );
}

// ─── Items Table Component ─────────────────────────────────────────────────

function ItemsTable({
  items,
  setItems,
  isAdmin,
}: {
  items: SaleItem[];
  setItems: (items: SaleItem[]) => void;
  isAdmin: boolean;
}) {
  const updateItem = (id: number, field: keyof SaleItem, val: string | number) => {
    setItems(
      items.map((item) => {
        if (item.id !== id) return item;
        const updated = { ...item, [field]: val };
        if (field === "cat") updated.commission = DEFAULT_COMMISSIONS[val as string] ?? "";
        return updated;
      })
    );
  };

  const addItem = () => {
    setItems([
      ...items,
      { id: Date.now(), desc: "", cat: "Accesorio", qty: 1, price: 0, commission: "2.5" },
    ]);
  };

  const removeItem = (id: number) => {
    if (items.length <= 1) {
      setItems([{ id: Date.now(), desc: "", cat: "Accesorio", qty: 1, price: 0, commission: "2.5" }]);
      return;
    }
    setItems(items.filter((i) => i.id !== id));
  };

  return (
    <div className="items-table-wrap">
      <table className="items-table">
        <thead>
          <tr>
            <th>Descripción</th>
            <th>Categoría</th>
            <th>Cant.</th>
            <th>Precio unit.</th>
            <th>Subtotal</th>
            {isAdmin && <th>Comisión %</th>}
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const subtotal = item.qty * item.price;
            return (
              <tr key={item.id}>
                <td>
                  <input
                    className="cell-input wide"
                    value={item.desc}
                    onChange={(e) => updateItem(item.id, "desc", e.target.value)}
                    placeholder="Descripción del artículo..."
                  />
                </td>
                <td>
                  <select
                    className="cell-select"
                    value={item.cat}
                    onChange={(e) => updateItem(item.id, "cat", e.target.value)}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    className="cell-input narrow"
                    type="number"
                    min={1}
                    value={item.qty}
                    onChange={(e) => updateItem(item.id, "qty", Math.max(1, Number(e.target.value)))}
                  />
                </td>
                <td>
                  <input
                    className="cell-input"
                    value={item.price === 0 ? "" : item.price.toString()}
                    onChange={(e) => updateItem(item.id, "price", Number(e.target.value.replace(/[^0-9.]/g, "")))}
                    placeholder="0.00"
                  />
                </td>
                <td className="cell-amount">{formatQuetzales(subtotal)}</td>
                {isAdmin && (
                  <td>
                    <div className="comm-cell">
                      {item.commission !== "" ? (
                        <input
                          className="cell-input narrow"
                          value={item.commission}
                          onChange={(e) => updateItem(item.id, "commission", e.target.value)}
                        />
                      ) : (
                        <span className="badge badge-neutral">Pendiente</span>
                      )}
                    </div>
                  </td>
                )}
                <td>
                  <button type="button" className="icon-button" onClick={() => removeItem(item.id)} aria-label="Quitar">
                    <Icon name="trash" size="sm" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button type="button" className="add-item-btn" onClick={addItem}>
        <Icon name="plus" size="sm" />
        <span>Agregar artículo</span>
      </button>
    </div>
  );
}

// ─── Invoice Preview Component ─────────────────────────────────────────────

function InvoicePreview({
  items,
  paymentMethod,
  seller,
  clientId,
  idType,
  clientName,
  clientAddress,
  total,
  observations,
  onNewSale,
}: {
  items: SaleItem[];
  paymentMethod: string;
  seller: string;
  clientId: string;
  idType: string;
  clientName: string;
  clientAddress: string;
  total: number;
  observations: string;
  onNewSale: () => void;
}) {
  const currentDate = new Date();
  const formattedDateTime = `${currentDate.toLocaleDateString("es-GT")} · ${currentDate.toLocaleTimeString("es-GT", { hour: "2-digit", minute: "2-digit" })}`;
  const uuid = "DB4A-849F-11EF-8C9A-00163E002C4F";
  const series = "FEL-A";
  const dteNumber = String(Math.floor(100 + Math.random() * 900)).padStart(5, "0");

  return (
    <div className="invoice-page">
      <div className="invoice-actions">
        <div />
        <div>
          <Button variant="secondary" icon="download">Descargar PDF</Button>
          <Button icon="print">Imprimir</Button>
          <Button variant="secondary" onClick={onNewSale}>Registrar otra venta</Button>
        </div>
      </div>
      <div className="invoice-sheet">
        <div className="invoice-head">
          <div className="invoice-brand">
            <img className="brand-logo" src={logo} alt="SoloMotos" />
            <span>Pasión que te mueve</span>
          </div>
          <div className="invoice-meta">
            <Badge tone="success">FACTURA FEL</Badge>
            <strong>No. SM-{dteNumber}</strong>
            <span>Fecha: {formattedDateTime}</span>
          </div>
        </div>
        <div className="invoice-company">
          <div>
            <strong>SoloMotos Quetzaltenango</strong>
            <span>NIT: 8214573-6</span>
            <span>7a. calle 4-63, zona 2, Quetzaltenango</span>
            <span>Tel. +502 7765 4321</span>
          </div>
          <div>
            <span>Vendedor</span>
            <strong>{seller}</strong>
          </div>
        </div>
        <div className="client-box">
          <div>
            <span>{idType}</span>
            <strong>{clientId || "CF"}</strong>
          </div>
          <div>
            <span>Nombre / Razón social</span>
            <strong>{clientName || "Consumidor Final"}</strong>
          </div>
          <div>
            <span>Dirección fiscal</span>
            <strong>{clientAddress || "Ciudad"}</strong>
          </div>
        </div>
        <div className="invoice-table">
          <div className="invoice-tr invoice-th">
            <span>Cant.</span>
            <span>Descripción</span>
            <span>Precio unit.</span>
            <span>Subtotal</span>
          </div>
          {items.map((item) => (
            <div key={item.id} className="invoice-tr">
              <span>{item.qty}</span>
              <span>
                <strong>{item.desc || "Artículo"}</strong>
                <small>{item.cat}</small>
              </span>
              <span>{formatQuetzales(item.price)}</span>
              <span><strong>{formatQuetzales(item.qty * item.price)}</strong></span>
            </div>
          ))}
        </div>
        <div className="invoice-total">
          <div>
            <span>Método de pago</span>
            <strong>{paymentMethod}</strong>
          </div>
          <div>
            <span>Total</span>
            <strong>{formatQuetzales(total)}</strong>
          </div>
          <div className="total-words">
            <span>Son:</span>
            <span>{numberToWords(total)}</span>
          </div>
        </div>
        {observations && (
          <div className="invoice-obs">
            <span>Observaciones:</span>
            <span>{observations}</span>
          </div>
        )}
        <div className="fel-block">
          <div className="fel-title">
            <Icon name="file" size="sm" /> Datos de certificación FEL
          </div>
          <div className="fel-grid">
            <div>
              <span>Serie</span>
              <strong>{series}</strong>
            </div>
            <div>
              <span>Número de DTE</span>
              <strong>{dteNumber}</strong>
            </div>
            <div className="fel-uuid">
              <span>Número de autorización</span>
              <strong>{uuid}</strong>
            </div>
            <div>
              <span>Fecha y hora de certificación</span>
              <strong>{formattedDateTime}</strong>
            </div>
          </div>
        </div>
        <div className="invoice-footer">
          <span>Gracias por preferir SoloMotos.</span>
          <span>Documento tributario electrónico autorizado por la SAT.</span>
        </div>
      </div>
    </div>
  );
}

function SaleSuccess({
  total,
  onNewSale,
  onHistory,
}: {
  total: number;
  onNewSale: () => void;
  onHistory: () => void;
}) {
  return (
    <div className="success-full">
      <div className="success-icon">
        <Icon name="check" />
      </div>
      <div className="success-title">Venta registrada correctamente</div>
      <div className="success-sub success-no-invoice">(sin factura)</div>
      <div className="success-amount">{formatQuetzales(total)}</div>
      <div className="success-actions">
        <Button onClick={onNewSale}>Registrar otra venta</Button>
        <Button variant="secondary" onClick={onHistory}>Ver ventas</Button>
      </div>
    </div>
  );
}

// ─── New Sale Screen ───────────────────────────────────────────────────────

function NewSale({
  role,
  onHistory,
  onAddSale,
}: {
  role: Role;
  onHistory: () => void;
  onAddSale: (sale: SaleRecord) => void;
}) {
  const isAdmin = role === "Administrador";
  const now = useCurrentDate();
  const saleTimestamp = `${capitalize(SALE_DATE_FORMAT.format(now))} · ${SALE_TIME_FORMAT.format(now)}`;

  // Inputs left blank/empty by default ("cosas libres")
  const [items, setItems] = useState<SaleItem[]>([
    { id: 1, desc: "", cat: "Accesorio", qty: 1, price: 0, commission: "2.5" },
  ]);
  const [seller, setSeller] = useState("María López");
  const [paymentMethod, setPaymentMethod] = useState("Tarjeta");
  const [isInvoiced, setIsInvoiced] = useState(true);
  const [idType, setIdType] = useState<"NIT" | "CUI">("NIT");
  const [clientId, setClientId] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [observations, setObservations] = useState("");
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);

  const total = items.reduce((acc, item) => acc + item.qty * item.price, 0);
  const isCF = clientId.trim().toUpperCase() === "CF";
  const isCfWarning = isInvoiced && isCF && total >= 2500;

  const handleResetSale = () => {
    setItems([{ id: 1, desc: "", cat: "Accesorio", qty: 1, price: 0, commission: "2.5" }]);
    setSeller("María López");
    setPaymentMethod("Tarjeta");
    setIsInvoiced(true);
    setIdType("NIT");
    setClientId("");
    setClientName("");
    setClientAddress("");
    setObservations("");
    setIsConfirmed(false);
  };

  const handleFillCF = () => {
    setClientId("CF");
    setClientName("Consumidor Final");
    setClientAddress("Ciudad");
  };

  const totalCommission = isAdmin
    ? items.reduce((acc, item) => {
      const pct = parseFloat(item.commission);
      return acc + (isNaN(pct) ? 0 : (item.qty * item.price * pct) / 100);
    }, 0)
    : 0;

  const handleConfirmSale = () => {
    const validItems = items.filter((i) => i.desc.trim() !== "" || i.price > 0);
    const resolvedItems = validItems.length > 0 ? validItems : items;
    const productSummary = resolvedItems.map((i) => i.desc.trim() || "Artículo").join(", ");
    const primaryCategory = resolvedItems[0]?.cat || "Accesorio";

    const newSaleRecord: SaleRecord = {
      id: Date.now(),
      time: saleTimestamp,
      timestamp: Date.now(),
      product: productSummary,
      category: primaryCategory,
      seller,
      paymentMethod,
      amount: total,
      commission: totalCommission > 0 ? formatQuetzales(totalCommission) : "Pendiente",
      invoiced: isInvoiced,
      locked: false,
      clientName: clientName.trim() || (isCF ? "Consumidor Final" : "Cliente"),
      clientId: clientId.trim() || "CF",
      clientAddress: clientAddress.trim(),
      observations: observations.trim(),
      items: resolvedItems,
    };

    onAddSale(newSaleRecord);
    setIsConfirmModalOpen(false);
    setIsConfirmed(true);
  };

  if (isConfirmed) {
    if (isInvoiced) {
      return (
        <InvoicePreview
          items={items}
          paymentMethod={paymentMethod}
          seller={seller}
          clientId={clientId}
          idType={idType}
          clientName={clientName}
          clientAddress={clientAddress}
          total={total}
          observations={observations}
          onNewSale={handleResetSale}
        />
      );
    }
    return <SaleSuccess total={total} onNewSale={handleResetSale} onHistory={onHistory} />;
  }

  return (
    <div className="sale-layout">
      <div className="sale-main screen-stack">
        <Card className="form-card">
          <div className="form-section-title">
            <span>1</span>
            <div>
              <strong>Datos de la venta</strong>
              <small>Información principal de la operación</small>
            </div>
          </div>
          <div className="form-grid two">
            <div className="field">
              <span className="field-label">Fecha y hora</span>
              <div className="readonly-datetime">
                <strong>{saleTimestamp}</strong>
                <small>Hora registrada por el sistema</small>
              </div>
            </div>
            <Select label="Vendedor" value={seller} options={ACTIVE_SELLERS} onChange={setSeller} />
          </div>
          <div className="field-block">
            <div className="field-label">Método de pago</div>
            <Segmented
              options={["Efectivo", "Transferencia", "Tarjeta"]}
              value={paymentMethod}
              onChange={setPaymentMethod}
              icons={["cash", "bank", "card"]}
            />
          </div>
        </Card>

        <Card className="form-card">
          <div className="form-section-title">
            <span>2</span>
            <div>
              <strong>Artículos</strong>
              <small>Productos o servicios incluidos en esta venta</small>
            </div>
          </div>
          <ItemsTable items={items} setItems={setItems} isAdmin={isAdmin} />
        </Card>

        <Card className="form-card">
          <div className="invoice-toggle">
            <div>
              <div className="card-title">Facturación</div>
              <div className="muted small">Se emitirá una factura electrónica FEL</div>
            </div>
            <Toggle checked={isInvoiced} onChange={setIsInvoiced} label="¿Facturar esta venta?" />
          </div>
          {isInvoiced && (
            <div className="invoice-fields">
              <div className="section-divider" />
              <div className="form-section-title">
                <span>3</span>
                <div>
                  <strong>Datos del cliente</strong>
                  <small>Información requerida para la factura</small>
                </div>
              </div>
              <div className="client-id-row">
                <div className="id-type-seg">
                  <UnstyledButton
                    className={idType === "NIT" ? "id-type-btn selected" : "id-type-btn"}
                    onClick={() => setIdType("NIT")}
                  >
                    NIT
                  </UnstyledButton>
                  <UnstyledButton
                    className={idType === "CUI" ? "id-type-btn selected" : "id-type-btn"}
                    onClick={() => setIdType("CUI")}
                  >
                    CUI
                  </UnstyledButton>
                </div>
                <TextInput
                  placeholder={idType === "NIT" ? "Ej. 5489632-1" : "Ej. 2345 12345 0101"}
                  value={clientId}
                  onChange={setClientId}
                  icon="search"
                />
                <button type="button" className="cf-btn" onClick={handleFillCF}>
                  Consumidor Final (CF)
                </button>
              </div>
              {isCfWarning && (
                <div className="cf-warning">
                  <Icon name="bell" size="sm" />
                  <span>Para ventas de Q2,500.00 o más la SAT requiere NIT o CUI del comprador.</span>
                </div>
              )}
              <div className="form-grid two">
                <div className="span-two">
                  <TextInput
                    label="Nombre o razón social"
                    value={clientName}
                    onChange={setClientName}
                    placeholder="Nombre del cliente o empresa"
                  />
                </div>
                <div className="span-two">
                  <TextInput
                    label="Dirección fiscal"
                    value={clientAddress}
                    onChange={setClientAddress}
                    placeholder="Dirección fiscal para factura"
                  />
                </div>
                <div className="span-two">
                  <TextArea
                    label="Observaciones en factura (opcional)"
                    value={observations}
                    onChange={setObservations}
                    placeholder="Ej. Crédito 30 días, referencia de pedido, etc."
                  />
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>

      <aside className="sale-summary">
        <Card>
          <div className="summary-title">Resumen de venta</div>
          <div className="summary-items">
            {items.map((item) => (
              <div key={item.id} className="summary-item-line">
                <span className="summary-item-desc">
                  {item.desc || "Artículo sin nombre"} <span className="summary-item-qty">×{item.qty}</span>
                </span>
                <strong>{formatQuetzales(item.qty * item.price)}</strong>
              </div>
            ))}
          </div>
          <div className="summary-lines">
            <div>
              <span>Subtotal</span>
              <strong>{formatQuetzales(total)}</strong>
            </div>
            <div>
              <span>Método de pago</span>
              <strong>{paymentMethod}</strong>
            </div>
            {isAdmin && (
              <div>
                <span>Comisión estimada</span>
                <strong>{formatQuetzales(totalCommission)}</strong>
              </div>
            )}
            <div>
              <span>Factura FEL</span>
              <Badge tone={isInvoiced ? "success" : "neutral"}>{isInvoiced ? "Sí" : "No"}</Badge>
            </div>
          </div>
          <div className="summary-total">
            <span>Total</span>
            <strong>{formatQuetzales(total)}</strong>
          </div>
          <Button
            className="full-button"
            icon="check"
            onClick={() => setIsConfirmModalOpen(true)}
            disabled={total <= 0}
          >
            Confirmar venta
          </Button>
          <div className="summary-note">
            <Icon name="lock" size="sm" /> Revisa los datos antes de confirmar
          </div>
        </Card>
      </aside>

      <Modal
        open={isConfirmModalOpen}
        title="Confirmar venta"
        onClose={() => setIsConfirmModalOpen(false)}
        onConfirm={handleConfirmSale}
        confirmLabel="Registrar venta"
      >
        <div className="confirm-box">
          <div>
            <span>Total</span>
            <strong>{formatQuetzales(total)}</strong>
          </div>
          <div>
            <span>Vendedor</span>
            <strong>{seller}</strong>
          </div>
          <div>
            <span>Método de pago</span>
            <strong>{paymentMethod}</strong>
          </div>
          {isInvoiced && (
            <div>
              <span>Cliente</span>
              <strong>{clientName || (isCF ? "Consumidor Final" : "CF")}</strong>
            </div>
          )}
          <div>
            <span>Factura FEL</span>
            <strong>{isInvoiced ? "Sí" : "No"}</strong>
          </div>
        </div>
        <div className="modal-hint">
          {isInvoiced
            ? "Al confirmar, la venta se guardará y se generará la factura FEL."
            : "Al confirmar, la venta se guardará sin factura."}
        </div>
      </Modal>
    </div>
  );
}

// ─── Compact Sales Table Component ─────────────────────────────────────────

function SalesTable({
  compact = false,
  salesData,
  onNewSale,
}: {
  compact?: boolean;
  salesData?: RecentSaleRow[];
  onNewSale?: () => void;
}) {
  if (!salesData || salesData.length === 0) {
    return (
      <div className="empty-state-box">
        <div className="empty-state-icon">
          <Icon name="receipt" />
        </div>
        <div className="empty-state-title">No hay ventas registradas aún</div>
        <div className="empty-state-desc">Las ventas que registres se mostrarán aquí en tiempo real.</div>
        {onNewSale && (
          <Button icon="plus" onClick={onNewSale}>
            Registrar primera venta
          </Button>
        )}
      </div>
    );
  }

  const list = salesData.slice(0, compact ? 3 : 5);
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Fecha / Hora</th>
            <th>Producto</th>
            <th>Vendedor</th>
            <th>Monto</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {list.map((row) => (
            <tr key={row.id}>
              <td>{row.time}</td>
              <td><strong>{row.product}</strong></td>
              <td>{row.seller}</td>
              <td><strong>{formatQuetzales(row.amount)}</strong></td>
              <td>
                <Badge tone={row.isInvoiced ? "success" : "neutral"}>
                  {row.invoiceStatus}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Commission Modal Component ────────────────────────────────────────────

function AssignCommissionModal({
  open,
  saleProduct,
  saleAmount,
  onClose,
  onConfirm,
}: {
  open: boolean;
  saleProduct: string;
  saleAmount: number;
  onClose: () => void;
  onConfirm: (pct: string) => void;
}) {
  const [commissionPct, setCommissionPct] = useState("4.0");
  const calculated = isNaN(parseFloat(commissionPct)) ? 0 : (saleAmount * parseFloat(commissionPct)) / 100;

  return (
    <Modal open={open} title="Asignar comisión" onClose={onClose} onConfirm={() => onConfirm(commissionPct)} confirmLabel="Guardar comisión">
      <div className="muted small" style={{ marginBottom: 14 }}>
        {saleProduct} · {formatQuetzales(saleAmount)}
      </div>
      <TextInput label="Porcentaje de comisión (%)" value={commissionPct} onChange={setCommissionPct} />
      <div className="commission-calc" style={{ marginTop: 12 }}>
        <span>Comisión calculada</span>
        <strong>{formatQuetzales(calculated)}</strong>
      </div>
    </Modal>
  );
}

// ─── Sales History Screen ──────────────────────────────────────────────────

function SalesHistory({
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
            options={["Todos los vendedores", ...ACTIVE_SELLERS]}
            onChange={setFilterSeller}
          />
          <Select
            value={filterCategory}
            options={["Todas las categorías", ...CATEGORIES]}
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

// ─── Employee Home Screen ──────────────────────────────────────────────────

function EmployeeHome({
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

// ─── Order Detail Component ────────────────────────────────────────────────

const WORKSHOP_STATUS_SEQUENCE: WorkshopStatus[] = ["Recibida", "En reparación", "Lista para entregar", "Entregada"];
const WORKSHOP_STATUS_TONES: Record<WorkshopStatus, "neutral" | "warning" | "success" | "info"> = {
  "Recibida": "neutral",
  "En reparación": "warning",
  "Lista para entregar": "success",
  "Entregada": "info",
};

function OrderDetail({
  order,
  isAdmin,
  onBack,
  onUpdate,
}: {
  order: WorkshopOrder;
  isAdmin: boolean;
  onBack: () => void;
  onUpdate: (o: WorkshopOrder) => void;
}) {
  const statusIndex = WORKSHOP_STATUS_SEQUENCE.indexOf(order.status);
  const nextStatus = WORKSHOP_STATUS_SEQUENCE[statusIndex + 1] as WorkshopStatus | undefined;
  const [finalCost, setFinalCost] = useState(order.cost.toString());
  const [isFinalCostModalOpen, setIsFinalCostModalOpen] = useState(false);
  const [isCollectModalOpen, setIsCollectModalOpen] = useState(false);
  const [collectPaymentMethod, setCollectPaymentMethod] = useState("Efectivo");
  const [collectIsInvoiced, setCollectIsInvoiced] = useState(false);
  const [collectIdType, setCollectIdType] = useState<"NIT" | "CUI">("NIT");
  const [collectId, setCollectId] = useState("");
  const [collectClientName, setCollectClientName] = useState(order.client);
  const [collectAddress, setCollectAddress] = useState("");

  const isCollectCF = collectId.toUpperCase() === "CF";
  const collectTotal = parseFloat(finalCost) || 0;

  const handleAdvanceStatus = () => {
    if (!nextStatus) return;
    if (nextStatus === "Lista para entregar") {
      setIsFinalCostModalOpen(true);
      return;
    }
    if (nextStatus === "Entregada") {
      setIsCollectModalOpen(true);
      return;
    }
    const timestampStr = new Date().toLocaleDateString("es-GT") + " " + new Date().toTimeString().slice(0, 5);
    onUpdate({
      ...order,
      status: nextStatus,
      log: [...order.log, { ts: timestampStr, event: `Pasó a ${nextStatus}` }],
    });
  };

  const handleConfirmFinalCost = () => {
    const costValue = parseFloat(finalCost) || order.cost;
    const timestampStr = new Date().toLocaleDateString("es-GT") + " " + new Date().toTimeString().slice(0, 5);
    onUpdate({
      ...order,
      status: "Lista para entregar",
      cost: costValue,
      costType: "final",
      log: [...order.log, { ts: timestampStr, event: `Lista para entregar · costo final: ${formatQuetzales(costValue)}` }],
    });
    setIsFinalCostModalOpen(false);
  };

  const handleConfirmCollection = () => {
    const costValue = parseFloat(finalCost) || order.cost;
    const timestampStr = new Date().toLocaleDateString("es-GT") + " " + new Date().toTimeString().slice(0, 5);
    onUpdate({
      ...order,
      status: "Entregada",
      cost: costValue,
      costType: "cobrado",
      log: [...order.log, { ts: timestampStr, event: "Entregada y cobrada" }],
    });
    setIsCollectModalOpen(false);
  };

  return (
    <div className="screen-stack">
      <div className="hero-row">
        <div className="order-back">
          <button type="button" className="back-btn" onClick={onBack}>
            <Icon name="chevron" size="sm" />
          </button>
          <div>
            <div className="section-title">{order.id}</div>
            <div className="muted">{order.client} · {order.moto}</div>
          </div>
        </div>
        <div className="row-actions">
          {nextStatus && (
            <Button icon="check" onClick={handleAdvanceStatus}>
              {nextStatus === "Entregada" ? "Cobrar y entregar" : `Pasar a: ${nextStatus}`}
            </Button>
          )}
        </div>
      </div>

      <div className="step-indicator">
        {WORKSHOP_STATUS_SEQUENCE.map((statusName, idx) => (
          <div
            key={statusName}
            className={`step ${idx <= statusIndex ? "done" : ""} ${idx === statusIndex ? "current" : ""}`}
          >
            <div className="step-dot">
              {idx < statusIndex ? <Icon name="check" size="sm" /> : <span>{idx + 1}</span>}
            </div>
            <div className="step-label">{statusName}</div>
            {idx < WORKSHOP_STATUS_SEQUENCE.length - 1 && <div className="step-line" />}
          </div>
        ))}
      </div>

      <div className="order-grid">
        <Card className="form-card">
          <div className="card-title" style={{ marginBottom: 16 }}>Detalles de la orden</div>
          <div className="order-detail-rows">
            <div><span>Cliente</span><strong>{order.client}</strong></div>
            <div><span>Teléfono</span><strong>{order.phone}</strong></div>
            <div><span>Motocicleta</span><strong>{order.moto}</strong></div>
            <div><span>Trabajo solicitado</span><strong>{order.work}</strong></div>
            <div><span>Mecánico</span><strong>{order.mechanic}</strong></div>
            <div><span>Costo</span><strong>{formatQuetzales(order.cost)} <span className="cost-type">({order.costType})</span></strong></div>
          </div>
        </Card>
        <Card>
          <div className="card-title" style={{ marginBottom: 16 }}>Bitácora</div>
          <div className="order-log">
            {order.log.map((entry, i) => (
              <div key={i} className="log-entry">
                <div className="log-dot" />
                <div>
                  <strong>{entry.ts}</strong>
                  <span>{entry.event}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Modal open={isFinalCostModalOpen} title="Ingresar costo final" onClose={() => setIsFinalCostModalOpen(false)} onConfirm={handleConfirmFinalCost} confirmLabel="Confirmar">
        <TextInput label="Costo final del servicio" value={finalCost} onChange={setFinalCost} />
        <div className="modal-hint">Este será el monto que se cobrará al cliente.</div>
      </Modal>

      <Modal open={isCollectModalOpen} title="Cobrar y entregar" onClose={() => setIsCollectModalOpen(false)} onConfirm={handleConfirmCollection} confirmLabel="Confirmar cobro">
        <div className="form-grid two">
          <div className="span-two">
            <TextInput label="Costo final cobrado" value={finalCost} onChange={setFinalCost} />
          </div>
          <div className="span-two">
            <div className="field-label" style={{ marginBottom: 8 }}>Método de pago</div>
            <Segmented
              options={["Efectivo", "Transferencia", "Tarjeta"]}
              value={collectPaymentMethod}
              onChange={setCollectPaymentMethod}
              icons={["cash", "bank", "card"]}
            />
          </div>
        </div>
        <div style={{ marginTop: 16 }}>
          <Toggle checked={collectIsInvoiced} onChange={setCollectIsInvoiced} label="¿Facturar este servicio?" />
        </div>
        {collectIsInvoiced && (
          <div style={{ marginTop: 16 }} className="screen-stack">
            <div className="client-id-row">
              <div className="id-type-seg">
                <UnstyledButton
                  className={collectIdType === "NIT" ? "id-type-btn selected" : "id-type-btn"}
                  onClick={() => setCollectIdType("NIT")}
                >
                  NIT
                </UnstyledButton>
                <UnstyledButton
                  className={collectIdType === "CUI" ? "id-type-btn selected" : "id-type-btn"}
                  onClick={() => setCollectIdType("CUI")}
                >
                  CUI
                </UnstyledButton>
              </div>
              <TextInput
                placeholder={collectIdType === "NIT" ? "Ej. 5489632-1" : "Ej. 2345 12345 0101"}
                value={collectId}
                onChange={setCollectId}
                icon="search"
              />
              <button
                type="button"
                className="cf-btn"
                onClick={() => {
                  setCollectId("CF");
                  setCollectClientName("Consumidor Final");
                  setCollectAddress("Ciudad");
                }}
              >
                CF
              </button>
            </div>
            {collectIsInvoiced && isCollectCF && collectTotal >= 2500 && (
              <div className="cf-warning">
                <Icon name="bell" size="sm" />
                <span>Para ventas de Q2,500.00 o más la SAT requiere NIT o CUI del comprador.</span>
              </div>
            )}
            <TextInput label="Nombre o razón social" value={collectClientName} onChange={setCollectClientName} />
            <TextInput label="Dirección fiscal" value={collectAddress} onChange={setCollectAddress} />
          </div>
        )}
      </Modal>
    </div>
  );
}

// ─── Workshop Screen ───────────────────────────────────────────────────────

function Workshop({
  role,
  orders,
  onAddOrder,
  onUpdateOrder,
  initialOrderId = null,
}: {
  role: Role;
  orders: WorkshopOrder[];
  onAddOrder: (order: WorkshopOrder) => void;
  onUpdateOrder: (order: WorkshopOrder) => void;
  initialOrderId?: string | null;
}) {
  const isAdmin = role === "Administrador";
  const [activeTab, setActiveTab] = useState<"activas" | "historial">("activas");
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(initialOrderId);
  const [searchQuery, setSearchQuery] = useState("");

  // New order blank form fields ("cosas libres")
  const [newClientName, setNewClientName] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("");
  const [newMoto, setNewMoto] = useState("");
  const [newWorkDescription, setNewWorkDescription] = useState("");
  const [newMechanic, setNewMechanic] = useState(ACTIVE_MECHANICS[0]);
  const [newEstimatedCost, setNewEstimatedCost] = useState("");

  const handleSaveOrder = () => {
    if (!newClientName.trim() || !newMoto.trim()) return;
    const now = new Date();
    const timestampStr = `${now.toLocaleDateString("es-GT")} ${now.toLocaleTimeString("es-GT", { hour: "2-digit", minute: "2-digit" })}`;
    const newOrder: WorkshopOrder = {
      id: `SM-${1040 + orders.length + 1}`,
      client: newClientName.trim(),
      phone: newClientPhone.trim(),
      moto: newMoto.trim(),
      work: newWorkDescription.trim() || "Servicio general",
      mechanic: newMechanic,
      status: "Recibida",
      cost: parseFloat(newEstimatedCost) || 0,
      costType: "estimado",
      log: [{ ts: timestampStr, event: "Orden recibida" }],
    };

    onAddOrder(newOrder);
    setNewClientName("");
    setNewClientPhone("");
    setNewMoto("");
    setNewWorkDescription("");
    setNewEstimatedCost("");
    setIsNewModalOpen(false);
  };

  const detailOrder = orders.find((o) => o.id === selectedOrderId);
  if (detailOrder) {
    return (
      <div className="content-inner">
        <OrderDetail
          order={detailOrder}
          isAdmin={isAdmin}
          onBack={() => setSelectedOrderId(null)}
          onUpdate={(updated) => {
            onUpdateOrder(updated);
            setSelectedOrderId(null);
          }}
        />
      </div>
    );
  }

  const activeOrders = orders.filter((o) => o.status !== "Entregada");
  const historyOrders = orders.filter((o) => o.status === "Entregada");
  const displayedOrders = (activeTab === "activas" ? activeOrders : historyOrders).filter(
    (o) => !searchQuery || o.client.toLowerCase().includes(searchQuery.toLowerCase()) || o.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="screen-stack">
      <div className="hero-row">
        <div>
          <div className="section-title">Órdenes de taller</div>
          <div className="muted">Registra y da seguimiento a los servicios de motocicletas.</div>
        </div>
        <Button icon="plus" onClick={() => setIsNewModalOpen(true)}>
          Nuevo servicio
        </Button>
      </div>

      <div className="mini-kpis">
        <Card>
          <span>Recibidas</span>
          <strong style={{ color: "var(--color-text)" }}>{orders.filter((o) => o.status === "Recibida").length}</strong>
        </Card>
        <Card>
          <span>En reparación</span>
          <strong style={{ color: "var(--color-warning)" }}>{orders.filter((o) => o.status === "En reparación").length}</strong>
        </Card>
        <Card>
          <span>Listas para entregar</span>
          <strong style={{ color: "var(--color-success)" }}>{orders.filter((o) => o.status === "Lista para entregar").length}</strong>
        </Card>
        <Card>
          <span>Entregadas</span>
          <strong style={{ color: "var(--color-blue)" }}>{orders.filter((o) => o.status === "Entregada").length}</strong>
        </Card>
      </div>

      <Card>
        <div className="workshop-header">
          <div className="workshop-tabs">
            <button
              type="button"
              className={`workshop-tab ${activeTab === "activas" ? "active" : ""}`}
              onClick={() => setActiveTab("activas")}
            >
              Órdenes activas <span className="tab-count">{activeOrders.length}</span>
            </button>
            <button
              type="button"
              className={`workshop-tab ${activeTab === "historial" ? "active" : ""}`}
              onClick={() => setActiveTab("historial")}
            >
              Historial <span className="tab-count">{historyOrders.length}</span>
            </button>
          </div>
          <TextInput
            placeholder="Buscar por cliente u orden..."
            icon="search"
            value={searchQuery}
            onChange={setSearchQuery}
          />
        </div>

        {displayedOrders.length === 0 ? (
          <div className="empty-state-box">
            <div className="empty-state-icon">
              <Icon name="wrench" />
            </div>
            <div className="empty-state-title">No hay órdenes en esta sección</div>
            <div className="empty-state-desc">Haz clic en Nuevo servicio para registrar una nueva orden de trabajo.</div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Orden</th>
                  <th>Cliente</th>
                  <th>Teléfono</th>
                  <th>Moto / placa</th>
                  <th>Trabajo</th>
                  <th>Mecánico</th>
                  <th>Estado</th>
                  <th>Costo</th>
                </tr>
              </thead>
              <tbody>
                {displayedOrders.map((row) => (
                  <tr key={row.id} style={{ cursor: "pointer" }} onClick={() => setSelectedOrderId(row.id)}>
                    <td><strong>{row.id}</strong></td>
                    <td>{row.client}</td>
                    <td>{row.phone || "—"}</td>
                    <td>{row.moto}</td>
                    <td>{row.work}</td>
                    <td>{row.mechanic}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <Badge tone={WORKSHOP_STATUS_TONES[row.status]}>{row.status}</Badge>
                    </td>
                    <td>
                      <strong>{formatQuetzales(row.cost)}</strong>{" "}
                      <span className="cost-type">({row.costType})</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={isNewModalOpen}
        title="Registrar servicio de taller"
        onClose={() => setIsNewModalOpen(false)}
        onConfirm={handleSaveOrder}
        confirmLabel="Guardar servicio"
      >
        <div className="form-grid two">
          <TextInput
            label="Cliente"
            placeholder="Nombre completo"
            value={newClientName}
            onChange={setNewClientName}
          />
          <TextInput
            label="Teléfono"
            placeholder="Ej. 5512-3344"
            value={newClientPhone}
            onChange={setNewClientPhone}
          />
          <div className="span-two">
            <TextInput
              label="Motocicleta / placa"
              placeholder="Ej. Honda CB190R · P-482JDM"
              value={newMoto}
              onChange={setNewMoto}
            />
          </div>
          <div className="span-two">
            <TextArea
              label="Descripción del trabajo"
              placeholder="Describe el servicio requerido"
              value={newWorkDescription}
              onChange={setNewWorkDescription}
            />
          </div>
          <Select
            label="Mecánico"
            value={newMechanic}
            options={ACTIVE_MECHANICS}
            onChange={setNewMechanic}
          />
          <TextInput
            label="Costo estimado"
            placeholder="Q 0.00"
            value={newEstimatedCost}
            onChange={setNewEstimatedCost}
          />
        </div>
      </Modal>
    </div>
  );
}

// ─── Commissions Screen ────────────────────────────────────────────────────

function Commissions({
  sales,
  onUpdateSale,
}: {
  sales: SaleRecord[];
  onUpdateSale: (updated: SaleRecord) => void;
}) {
  const [assignTarget, setAssignTarget] = useState<SaleRecord | null>(null);
  const [selectedSeller, setSelectedSeller] = useState("María López");
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
          <Select value={selectedSeller} options={ACTIVE_SELLERS} onChange={setSelectedSeller} />
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

// ─── Stats Screen ──────────────────────────────────────────────────────────

const STATS_TABS = ["Ventas", "Vendedores", "Categorías", "Ventas vs. gastos", "Taller"];

function Stats({
  sales,
  expenses,
  orders,
}: {
  sales: SaleRecord[];
  expenses: ExpenseRecord[];
  orders: WorkshopOrder[];
}) {
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
        <Select label="Vendedor" value={selectedSeller} options={["Todos", ...ACTIVE_SELLERS]} onChange={setSelectedSeller} />
        <Select label="Categoría" value={selectedCategory} options={["Todas", ...CATEGORIES]} onChange={setSelectedCategory} />
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
                {ACTIVE_SELLERS.map((sellerName) => {
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
                {CATEGORIES.map((cat, i) => {
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

// ─── Expenses Screen ───────────────────────────────────────────────────────

function Expenses({
  expenses,
  onAddExpense,
  onDeleteExpense,
}: {
  expenses: ExpenseRecord[];
  onAddExpense: (expense: ExpenseRecord) => void;
  onDeleteExpense: (id: string | number) => void;
}) {
  const [expenseDate, setExpenseDate] = useState(() => startOfDay(new Date()));
  const [expenseMonth, setExpenseMonth] = useState(() => startOfMonth(new Date()));
  const [amountInput, setAmountInput] = useState("");
  const [categoryInput, setCategoryInput] = useState("Servicios");
  const [descriptionInput, setDescriptionInput] = useState("");

  const handleSaveExpense = () => {
    const numericAmount = parseFloat(amountInput);
    if (!numericAmount || numericAmount <= 0 || !descriptionInput.trim()) return;

    const newExpense: ExpenseRecord = {
      id: Date.now(),
      date: expenseDate.toLocaleDateString("es-GT", { day: "2-digit", month: "short" }),
      timestamp: expenseDate.getTime(),
      description: descriptionInput.trim(),
      category: categoryInput,
      amount: numericAmount,
    };

    onAddExpense(newExpense);
    setAmountInput("");
    setDescriptionInput("");
  };

  const totalMonthExpenses = expenses.reduce((acc, e) => acc + e.amount, 0);

  return (
    <div className="split-layout">
      <Card className="form-card">
        <div className="card-title">Registrar compra o gasto</div>
        <div className="muted small">Agrega una compra o gasto operativo.</div>
        <div className="vertical-form">
          <DatePicker label="Fecha" value={expenseDate} onChange={setExpenseDate} max={new Date()} />
          <TextInput
            label="Monto"
            placeholder="Q 0.00"
            value={amountInput}
            onChange={setAmountInput}
          />
          <Select
            label="Categoría"
            value={categoryInput}
            options={["Servicios", "Repuestos", "Renta", "Planilla", "Otros"]}
            onChange={setCategoryInput}
          />
          <TextArea
            label="Descripción"
            placeholder="Detalle del gasto"
            value={descriptionInput}
            onChange={setDescriptionInput}
          />
          <Button icon="plus" onClick={handleSaveExpense} disabled={!amountInput || !descriptionInput.trim()}>
            Guardar gasto
          </Button>
        </div>
      </Card>

      <Card>
        <div className="card-heading">
          <div>
            <div className="card-title">Gastos registrados</div>
            <div className="muted small">
              Total: {formatQuetzales(totalMonthExpenses)}
            </div>
          </div>
          <MonthPicker value={expenseMonth} onChange={setExpenseMonth} />
        </div>

        {expenses.length === 0 ? (
          <div className="empty-state-box">
            <div className="empty-state-icon">
              <Icon name="receipt" />
            </div>
            <div className="empty-state-title">No hay gastos registrados</div>
            <div className="empty-state-desc">Ingresa un gasto en el formulario de la izquierda para registrarlo.</div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Descripción</th>
                  <th>Categoría</th>
                  <th>Monto</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((row) => (
                  <tr key={row.id}>
                    <td>{row.date}</td>
                    <td><strong>{row.description}</strong></td>
                    <td><Badge>{row.category}</Badge></td>
                    <td><strong>{formatQuetzales(row.amount)}</strong></td>
                    <td>
                      <div className="row-actions">
                        <IconButton
                          icon="trash"
                          label="Eliminar"
                          onClick={() => onDeleteExpense(row.id)}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Staff / Personnel Screen ──────────────────────────────────────────────

interface StaffMember {
  id: number;
  name: string;
  initials: string;
  type: "Vendedor" | "Mecánico";
  info: string;
  active: boolean;
}

const DEFAULT_PERSONS: StaffMember[] = [
  { id: 1, name: "María López", initials: "ML", type: "Vendedor", info: "Ventas activas", active: true },
  { id: 2, name: "Carlos Pérez", initials: "CP", type: "Vendedor", info: "Ventas activas", active: true },
  { id: 3, name: "José Méndez", initials: "JM", type: "Vendedor", info: "Ventas activas", active: true },
  { id: 4, name: "Ana Castillo", initials: "AC", type: "Vendedor", info: "Disponible", active: false },
  { id: 5, name: "Mario Hernández", initials: "MH", type: "Mecánico", info: "Taller activo", active: true },
  { id: 6, name: "Pedro Ajú", initials: "PA", type: "Mecánico", info: "Taller activo", active: true },
  { id: 7, name: "Julio Tzul", initials: "JT", type: "Mecánico", info: "Taller activo", active: true },
  { id: 8, name: "Érick Chávez", initials: "EC", type: "Mecánico", info: "Disponible", active: true },
];

function Sellers() {
  const [persons, setPersons] = useState<StaffMember[]>(DEFAULT_PERSONS);
  const [typeFilter, setTypeFilter] = useState("Todos");
  const [statusFilter, setStatusFilter] = useState("Activos");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newPersonName, setNewPersonName] = useState("");
  const [newPersonType, setNewPersonType] = useState<"Vendedor" | "Mecánico">("Vendedor");

  const togglePerson = (id: number) => {
    setPersons(persons.map((p) => (p.id === id ? { ...p, active: !p.active } : p)));
  };

  const handleAddPerson = () => {
    if (!newPersonName.trim()) return;
    const initials = newPersonName
      .split(" ")
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
    setPersons([
      ...persons,
      {
        id: Date.now(),
        name: newPersonName.trim(),
        initials: initials || "ST",
        type: newPersonType,
        info: "Nuevo integrante",
        active: true,
      },
    ]);
    setNewPersonName("");
    setIsAddModalOpen(false);
  };

  const displayedPersons = persons.filter((p) => {
    const okType = typeFilter === "Todos" || p.type + "s" === typeFilter;
    const okStatus = statusFilter === "Todos" || (statusFilter === "Activos" ? p.active : !p.active);
    return okType && okStatus;
  });

  return (
    <div className="screen-stack">
      <div className="hero-row">
        <div>
          <div className="section-title">Personal</div>
          <div className="muted">Administra las personas asignadas a ventas y órdenes de taller.</div>
        </div>
        <Button icon="plus" onClick={() => setIsAddModalOpen(true)}>
          Agregar persona
        </Button>
      </div>

      <div className="info-banner">
        <Icon name="users" />
        <div>
          <strong>Sin cuentas de acceso</strong>
          <span>El personal no tiene cuentas de acceso al sistema. Los vendedores se asignan a ventas y los mecánicos a órdenes de taller.</span>
        </div>
      </div>

      <div className="personal-filters">
        <Segmented options={["Todos", "Vendedores", "Mecánicos"]} value={typeFilter} onChange={setTypeFilter} />
        <Segmented options={["Activos", "Inactivos", "Todos"]} value={statusFilter} onChange={setStatusFilter} />
      </div>

      <div className="seller-grid">
        {displayedPersons.map((p) => (
          <Card className="seller-card" key={p.id}>
            <div className={`seller-avatar ${p.type === "Mecánico" ? "mech" : ""}`}>{p.initials}</div>
            <div className="seller-info">
              <strong>{p.name}</strong>
              <span>{p.info}</span>
              <Badge tone={p.type === "Vendedor" ? "info" : "neutral"}>{p.type}</Badge>
            </div>
            <div className="seller-right">
              <button
                type="button"
                className={`person-toggle ${p.active ? "on" : ""}`}
                onClick={() => togglePerson(p.id)}
                title={p.active ? "Activo — click para desactivar" : "Inactivo — click para activar"}
              >
                <span />
                <span className="toggle-label">{p.active ? "Activo" : "Inactivo"}</span>
              </button>
            </div>
          </Card>
        ))}
      </div>

      <Modal open={isAddModalOpen} title="Agregar persona" onClose={() => setIsAddModalOpen(false)} onConfirm={handleAddPerson} confirmLabel="Agregar">
        <div className="vertical-form" style={{ marginTop: 0 }}>
          <TextInput
            label="Nombre completo"
            placeholder="Ej. Luisa Ajú"
            value={newPersonName}
            onChange={setNewPersonName}
          />
          <div className="field">
            <span className="field-label">Tipo</span>
            <div className="segmented">
              <UnstyledButton
                className={newPersonType === "Vendedor" ? "selected" : ""}
                onClick={() => setNewPersonType("Vendedor")}
              >
                <span>Vendedor</span>
              </UnstyledButton>
              <UnstyledButton
                className={newPersonType === "Mecánico" ? "selected" : ""}
                onClick={() => setNewPersonType("Mecánico")}
              >
                <span>Mecánico</span>
              </UnstyledButton>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ─── Period Closing Screen ─────────────────────────────────────────────────

function Closing({
  sales,
  onHistory,
  onClosePeriod,
}: {
  sales: SaleRecord[];
  onHistory: () => void;
  onClosePeriod: () => void;
}) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isUnderstoodConfirmed, setIsUnderstoodConfirmed] = useState(false);
  const periodStart = startOfMonth(new Date());
  const [periodEnd, setPeriodEnd] = useState(() => startOfDay(new Date()));
  const period = { start: periodStart, end: periodEnd };

  const cashSales = sales.filter((s) => s.paymentMethod === "Efectivo");
  const transferSales = sales.filter((s) => s.paymentMethod === "Transferencia");
  const cardSales = sales.filter((s) => s.paymentMethod === "Tarjeta");

  const cashTotal = cashSales.reduce((acc, s) => acc + s.amount, 0);
  const transferTotal = transferSales.reduce((acc, s) => acc + s.amount, 0);
  const cardTotal = cardSales.reduce((acc, s) => acc + s.amount, 0);
  const generalTotal = sales.reduce((acc, s) => acc + s.amount, 0);

  const pendingCommissionCount = sales.filter((s) => s.commission === "Pendiente").length;

  const handleConfirmClose = () => {
    onClosePeriod();
    setIsModalOpen(false);
    setIsUnderstoodConfirmed(false);
  };

  return (
    <div className="screen-stack">
      <Card className="closing-hero">
        <div>
          <Badge tone="warning">Período abierto</Badge>
          <div className="section-title">Cierre del {fmtRangeLong(period)}</div>
          <div className="muted">Verifica que todos los movimientos estén registrados antes de cerrar.</div>
        </div>
        <div className="closing-range">
          <div className="field">
            <span className="field-label">Desde</span>
            <div className="readonly-from" title="Inicio del período abierto">
              <Icon name="lock" size="sm" />
              {fmtLongDay(periodStart)}
            </div>
          </div>
          <DatePicker label="Hasta" value={periodEnd} onChange={setPeriodEnd} min={periodStart} max={new Date()} align="right" />
        </div>
      </Card>

      <div className="payment-totals">
        <Card>
          <Icon name="cash" />
          <span>Efectivo</span>
          <strong>{formatQuetzales(cashTotal)}</strong>
          <small>{cashSales.length} ventas</small>
        </Card>
        <Card>
          <Icon name="bank" />
          <span>Transferencia</span>
          <strong>{formatQuetzales(transferTotal)}</strong>
          <small>{transferSales.length} ventas</small>
        </Card>
        <Card>
          <Icon name="card" />
          <span>Tarjeta</span>
          <strong>{formatQuetzales(cardTotal)}</strong>
          <small>{cardSales.length} ventas</small>
        </Card>
        <Card className="total-card">
          <Icon name="trending" />
          <span>Total general</span>
          <strong>{formatQuetzales(generalTotal)}</strong>
          <small>{sales.length} ventas</small>
        </Card>
      </div>

      {pendingCommissionCount > 0 && (
        <div className="comm-pending-banner">
          <Icon name="coins" size="sm" />
          <span>Hay <strong>{pendingCommissionCount} ventas</strong> con comisión pendiente en este período. Asígnalas antes de cerrar.</span>
          <button type="button" className="forgot-link" onClick={onHistory}>Ver ventas</button>
        </div>
      )}

      <div className="close-action">
        <div>
          <strong>¿Todo está correcto?</strong>
          <span>Después del cierre no podrás modificar las ventas de este período.</span>
        </div>
        <Button icon="lock" onClick={() => setIsModalOpen(true)} disabled={sales.length === 0}>
          Cerrar período
        </Button>
      </div>

      <Card>
        <div className="card-title">Cierres anteriores</div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Periodo</th>
                <th>Fecha de cierre</th>
                <th>Ventas</th>
                <th>Total</th>
                <th>Responsable</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Período anterior</td>
                <td>Histórico de sistema</td>
                <td>—</td>
                <td><strong>Q 0.00</strong></td>
                <td>Administrador</td>
                <td><Badge tone="success">Cerrado</Badge></td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        open={isModalOpen}
        title={`¿Cerrar el período del ${fmtRangeLong(period)}?`}
        onClose={() => { setIsModalOpen(false); setIsUnderstoodConfirmed(false); }}
        onConfirm={handleConfirmClose}
        confirmLabel="Confirmar cierre"
        confirmDisabled={!isUnderstoodConfirmed}
      >
        <div className="warning-box">
          <Icon name="lock" />
          <span>Esta acción no se puede deshacer. Después del cierre no se podrán modificar ni eliminar ventas de este período.</span>
        </div>
        <div className="confirm-box">
          <div><span>Periodo</span><strong>{fmtRange(period)}</strong></div>
          <div><span>Total</span><strong>{formatQuetzales(generalTotal)}</strong></div>
          <div><span>Ventas</span><strong>{sales.length}</strong></div>
        </div>
        <label className="understood-check">
          <input
            type="checkbox"
            checked={isUnderstoodConfirmed}
            onChange={(e) => setIsUnderstoodConfirmed(e.target.checked)}
          />
          <span>Entiendo que esta acción es definitiva</span>
        </label>
      </Modal>
    </div>
  );
}

// ─── Settings Screen ───────────────────────────────────────────────────────

function Settings({
  dark,
  onSetDark,
  accent,
  onSetAccent,
}: {
  dark: boolean;
  onSetDark: (d: boolean) => void;
  accent: Accent;
  onSetAccent: (a: Accent) => void;
}) {
  const commissionCategories = [
    { label: "Accesorio", key: "Accesorio", default: "2.5" },
    { label: "Repuesto", key: "Repuesto", default: "2.5" },
    { label: "Moto nueva", key: "Moto nueva", default: "" },
    { label: "Moto usada", key: "Moto usada", default: "" },
    { label: "Otro", key: "Otro", default: "" },
  ];
  const [categoryCommissions, setCategoryCommissions] = useState<Record<string, string>>(
    Object.fromEntries(commissionCategories.map((c) => [c.key, c.default]))
  );

  return (
    <div className="settings-layout">
      <div className="screen-stack">
        <Card className="form-card">
          <div className="card-heading">
            <div>
              <div className="card-title">Comisiones por categoría</div>
              <div className="muted small">Porcentaje sugerido por categoría (opcional). Se aplica al registrar una venta.</div>
            </div>
            <Icon name="coins" />
          </div>
          <div className="settings-rows">
            {commissionCategories.map((c) => (
              <div key={c.key}>
                <strong>{c.label}</strong>
                <TextInput
                  value={categoryCommissions[c.key]}
                  placeholder="Sin definir"
                  onChange={(v) => setCategoryCommissions({ ...categoryCommissions, [c.key]: v })}
                />
              </div>
            ))}
          </div>
        </Card>

        <Card className="form-card">
          <div className="card-title">Control de facturación</div>
          <TextInput label="Límite mensual de facturas" value="200" />
          <div className="notice">
            <Icon name="file" size="sm" />
            <span>Incluye facturas de ventas y de taller. Recibirás una alerta al alcanzar el 80% del límite.</span>
          </div>
        </Card>

        <Card className="form-card">
          <div className="card-title">Apariencia</div>
          <div className="muted small" style={{ marginBottom: "1.25rem" }}>Selecciona el tema visual del sistema.</div>
          <div className="theme-selector">
            <button type="button" className={`theme-option${!dark ? " active" : ""}`} onClick={() => onSetDark(false)}>
              <div className="theme-preview light-preview"><div /><div /><div /></div>
              <div className="theme-option-label"><Icon name="sun" size="sm" /><span>Claro</span></div>
            </button>
            <button type="button" className={`theme-option${dark ? " active" : ""}`} onClick={() => onSetDark(true)}>
              <div className="theme-preview dark-preview"><div /><div /><div /></div>
              <div className="theme-option-label"><Icon name="moon" size="sm" /><span>Oscuro</span></div>
            </button>
          </div>
          <div className="field-label" style={{ margin: "1.5rem 0 0.35rem" }}>Color principal</div>
          <div className="muted small" style={{ marginBottom: "0.9rem" }}>Se aplica a botones, menú, gráficas y al inicio de sesión.</div>
          <div className="accent-selector">
            {ACCENTS.map((a) => (
              <button
                type="button"
                key={a.id}
                className={`accent-option${accent === a.id ? " active" : ""}`}
                onClick={() => onSetAccent(a.id)}
              >
                <span className="accent-swatch" style={{ background: a.swatch }}>
                  {accent === a.id && <Icon name="check" size="sm" />}
                </span>
                <span>
                  <span>{a.label}</span>
                  <small>{a.note}</small>
                </span>
              </button>
            ))}
          </div>
        </Card>
      </div>

      <Card className="form-card">
        <div className="card-title">Datos de la empresa</div>
        <div className="logo-uploader">
          <img className="brand-logo" src={logo} alt="SoloMotos" />
          <div>
            <strong>Logo de la empresa</strong>
            <span>PNG o JPG, máximo 2 MB</span>
            <Button variant="secondary">Cambiar logo</Button>
          </div>
        </div>
        <div className="vertical-form">
          <TextInput label="Nombre comercial" value="SoloMotos Quetzaltenango" />
          <TextInput label="NIT" value="8214573-6" />
          <TextArea label="Dirección" value="7a. calle 4-63, zona 2, Quetzaltenango" />
          <TextInput label="Teléfono" value="+502 7765 4321" />
          <Button icon="check">Guardar configuración</Button>
        </div>
      </Card>
    </div>
  );
}

// ─── Login Screen ──────────────────────────────────────────────────────────

function Login({ onLogin }: { onLogin: (role: Role, user?: UserSession) => void }) {
  const [selectedRole, setSelectedRole] = useState<Role>("Administrador");
  const [email, setEmail] = useState("admin@solomotos.com");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [backendStatus, setBackendStatus] = useState<"connected" | "fallback" | "offline" | null>(null);

  useEffect(() => {
    authService.getStatus().then((status) => {
      if (!status) {
        setBackendStatus("offline");
      } else if (status.database?.ok) {
        setBackendStatus("connected");
      } else {
        setBackendStatus("fallback");
      }
    });
  }, []);

  const handleRoleSelect = (r: Role) => {
    setSelectedRole(r);
    setEmail(r === "Administrador" ? "admin@solomotos.com" : "empleado@solomotos.com");
    setErrorMessage(null);
  };

  const handleLoginSubmit = async () => {
    if (!password) {
      setErrorMessage("Por favor ingresa tu contraseña.");
      return;
    }
    setLoading(true);
    setErrorMessage(null);

    const result = await authService.login({
      role: selectedRole,
      email: email.trim(),
      password,
    });

    setLoading(false);

    if (result.ok && result.user) {
      onLogin(result.user.rol, result.user);
    } else {
      setErrorMessage(result.error || "Contraseña o usuario incorrecto");
    }
  };

  return (
    <main className="login-page">
      <div className="login-art">
        <div className="login-brand">
          <img className="brand-logo" src={logo} alt="SoloMotos" />
          <span>Sistema de Ventas</span>
        </div>
        <div className="login-message">
          <div className="login-line" />
          <div>Control simple.<br />Decisiones más rápidas.</div>
          <span>Ventas, taller y facturación en un solo lugar.</span>
        </div>
        <div className="login-city">Quetzaltenango, Guatemala</div>
      </div>
      <div className="login-panel">
        <Card className="login-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <div className="login-title" style={{ margin: 0 }}>Bienvenido</div>
            {backendStatus === "connected" && (
              <span style={{ fontSize: "11px", color: "#10b981", background: "rgba(16, 185, 129, 0.1)", padding: "4px 8px", borderRadius: "12px", display: "inline-flex", alignItems: "center", gap: "5px" }}>
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#10b981" }} />
                Supabase conectado
              </span>
            )}
            {backendStatus === "fallback" && (
              <span style={{ fontSize: "11px", color: "#f59e0b", background: "rgba(245, 158, 11, 0.1)", padding: "4px 8px", borderRadius: "12px", display: "inline-flex", alignItems: "center", gap: "5px" }} title="Configura tus claves en .env">
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#f59e0b" }} />
                Modo Dev
              </span>
            )}
            {backendStatus === "offline" && (
              <span style={{ fontSize: "11px", color: "#6b7280", background: "rgba(107, 114, 128, 0.1)", padding: "4px 8px", borderRadius: "12px", display: "inline-flex", alignItems: "center", gap: "5px" }} title="Ejecuta: pnpm dev:server">
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#9ca3af" }} />
                Backend local
              </span>
            )}
          </div>
          <div className="muted">Selecciona tu perfil e ingresa tu contraseña.</div>
          <div className="vertical-form">
            <div className="field">
              <span className="field-label">Perfil de acceso</span>
              <div className="login-role-seg">
                <UnstyledButton
                  className={selectedRole === "Administrador" ? "login-role-btn selected" : "login-role-btn"}
                  onClick={() => handleRoleSelect("Administrador")}
                >
                  <Icon name="settings" size="sm" />
                  <span>Administrador</span>
                </UnstyledButton>
                <UnstyledButton
                  className={selectedRole === "Empleado" ? "login-role-btn selected" : "login-role-btn"}
                  onClick={() => handleRoleSelect("Empleado")}
                >
                  <Icon name="users" size="sm" />
                  <span>Empleado</span>
                </UnstyledButton>
              </div>
            </div>
            <div className="field">
              <span className="field-label">Correo electrónico</span>
              <span className="input-shell">
                <Icon name="mail" size="sm" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="usuario@solomotos.com"
                />
              </span>
            </div>
            <div className="field">
              <span className="field-label">Contraseña</span>
              <span className={`input-shell${errorMessage ? " has-error" : ""}`}>
                <Icon name="lock" size="sm" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  placeholder="••••••••"
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setErrorMessage(null);
                  }}
                  onKeyDown={(e) => e.key === "Enter" && handleLoginSubmit()}
                />
                <button
                  type="button"
                  className="eye-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                >
                  <Icon name="eye" size="sm" />
                </button>
              </span>
              {errorMessage && <span className="field-error">{errorMessage}</span>}
            </div>
            <Button onClick={handleLoginSubmit} disabled={loading}>
              {loading ? "Verificando..." : "Ingresar"}
            </Button>
            <div className="login-demo-hint">Demo: admin123 / empleado123</div>
          </div>
        </Card>
      </div>
    </main>
  );
}

// ─── Main Application Component ────────────────────────────────────────────

export default function App() {
  const [user, setUser] = useState<UserSession | null>(() => authService.getUser());
  const [loggedIn, setLoggedIn] = useState(() => Boolean(authService.getUser()));
  const [role, setRole] = useState<Role>(() => authService.getUser()?.rol || "Administrador");
  const [screen, setScreen] = useState<Screen>("dashboard");
  const [dark, setDark] = useState(false);
  const [accent, setAccent] = useState<Accent>("orange");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  // Dynamic state: empty by default, loaded from localStorage so user actions reflect across the app
  const [sales, setSales] = useState<SaleRecord[]>(() => salesStorage.getSales());
  const [expenses, setExpenses] = useState<ExpenseRecord[]>(() => salesStorage.getExpenses());
  const [workshopOrders, setWorkshopOrders] = useState<WorkshopOrder[]>(() => salesStorage.getWorkshopOrders());

  // Save to localStorage when state changes
  useEffect(() => {
    salesStorage.saveSales(sales);
  }, [sales]);

  useEffect(() => {
    salesStorage.saveExpenses(expenses);
  }, [expenses]);

  useEffect(() => {
    salesStorage.saveWorkshopOrders(workshopOrders);
  }, [workshopOrders]);

  // Verify backend session on mount
  useEffect(() => {
    authService.verifySession().then((verifiedUser) => {
      if (verifiedUser) {
        setUser(verifiedUser);
        setRole(verifiedUser.rol);
      }
    });
  }, []);

  useEffect(() => {
    document.documentElement.dataset.accent = accent;
  }, [accent]);

  const allowedScreen = useMemo(
    () => (role === "Empleado" && !["home", "sale", "history", "workshop"].includes(screen) ? "home" : screen),
    [role, screen]
  );

  const handleLogin = (r: Role, u?: UserSession) => {
    setRole(r);
    setUser(u || null);
    setScreen(r === "Administrador" ? "dashboard" : "home");
    setLoggedIn(true);
  };

  const handleLogout = () => {
    authService.logout();
    setUser(null);
    setLoggedIn(false);
    setScreen("dashboard");
  };

  // Action handlers that reflect user actions in real time
  const handleAddSale = (newSale: SaleRecord) => {
    setSales((prev) => [newSale, ...prev]);
    // Also notify backend in the background if running
    dashboardService.createSale({
      clientName: newSale.clientName,
      clientNit: newSale.clientId,
      sellerName: newSale.seller,
      productSummary: newSale.product,
      category: newSale.category,
      paymentMethod: newSale.paymentMethod,
      total: newSale.amount,
      isInvoiced: newSale.invoiced,
      observations: newSale.observations,
    });
  };

  const handleUpdateSale = (updatedSale: SaleRecord) => {
    setSales((prev) => prev.map((s) => (s.id === updatedSale.id ? updatedSale : s)));
  };

  const handleDeleteSale = (saleId: string | number) => {
    setSales((prev) => prev.filter((s) => s.id !== saleId));
  };

  const handleAddExpense = (newExpense: ExpenseRecord) => {
    setExpenses((prev) => [newExpense, ...prev]);
  };

  const handleDeleteExpense = (expenseId: string | number) => {
    setExpenses((prev) => prev.filter((e) => e.id !== expenseId));
  };

  const handleAddWorkshopOrder = (newOrder: WorkshopOrder) => {
    setWorkshopOrders((prev) => [newOrder, ...prev]);
  };

  const handleUpdateWorkshopOrder = (updatedOrder: WorkshopOrder) => {
    setWorkshopOrders((prev) => prev.map((o) => (o.id === updatedOrder.id ? updatedOrder : o)));
  };

  const handleClosePeriod = () => {
    setSales((prev) => prev.map((s) => ({ ...s, locked: true })));
  };

  if (!loggedIn) {
    return <Login onLogin={handleLogin} />;
  }

  const contentMap: Record<Screen, ReactNode> = {
    home: (
      <EmployeeHome
        sales={sales}
        orders={workshopOrders}
        onNewSale={() => setScreen("sale")}
        onInvoice={() => setScreen("history")}
        onViewOrder={(id) => {
          setSelectedOrderId(id);
          setScreen("workshop");
        }}
      />
    ),
    dashboard: (
      <Dashboard
        sales={sales}
        expenses={expenses}
        onNewSale={() => setScreen("sale")}
        onHistory={() => setScreen("history")}
      />
    ),
    sale: (
      <NewSale
        role={role}
        onHistory={() => setScreen("history")}
        onAddSale={handleAddSale}
      />
    ),
    history: (
      <SalesHistory
        role={role}
        sales={sales}
        onInvoice={() => setScreen("history")}
        onUpdateSale={handleUpdateSale}
        onDeleteSale={handleDeleteSale}
      />
    ),
    workshop: (
      <Workshop
        role={role}
        orders={workshopOrders}
        onAddOrder={handleAddWorkshopOrder}
        onUpdateOrder={handleUpdateWorkshopOrder}
        initialOrderId={selectedOrderId}
      />
    ),
    commissions: (
      <Commissions
        sales={sales}
        onUpdateSale={handleUpdateSale}
      />
    ),
    stats: (
      <Stats
        sales={sales}
        expenses={expenses}
        orders={workshopOrders}
      />
    ),
    expenses: (
      <Expenses
        expenses={expenses}
        onAddExpense={handleAddExpense}
        onDeleteExpense={handleDeleteExpense}
      />
    ),
    sellers: <Sellers />,
    closing: (
      <Closing
        sales={sales}
        onHistory={() => setScreen("history")}
        onClosePeriod={handleClosePeriod}
      />
    ),
    settings: (
      <Settings
        dark={dark}
        onSetDark={setDark}
        accent={accent}
        onSetAccent={setAccent}
      />
    ),
    invoice: (
      <div className="invoice-page">
        <Button variant="secondary" onClick={() => setScreen("history")}>
          Volver al historial
        </Button>
      </div>
    ),
  };

  return (
    <div className="app-shell" data-dark={dark ? "" : undefined}>
      <Sidebar
        active={allowedScreen}
        role={role}
        onNavigate={(next) => {
          setSelectedOrderId(null);
          setScreen(next);
        }}
      />
      <div className="app-main">
        <Header
          screen={allowedScreen}
          role={role}
          user={user}
          dark={dark}
          onToggleDark={() => setDark((d) => !d)}
          onLogout={handleLogout}
        />
        <main className="content">{contentMap[allowedScreen]}</main>
      </div>
    </div>
  );
}
