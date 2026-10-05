import { type ReactNode, useEffect, useMemo, useState } from "react";
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
const names: Record<Screen, string> = {
  home: "Inicio", dashboard: "Dashboard", sale: "Registrar nueva venta", history: "Historial de ventas", workshop: "Taller", commissions: "Comisiones por vendedor", stats: "Estadísticas y reportes", expenses: "Compras y gastos", sellers: "Personal", closing: "Cierre de ventas", settings: "Configuración", invoice: "Vista previa de factura"
};

const sales = [
  ["08:55", "Yamaha FZ 2.0", "Moto usada", "José Méndez", "Transferencia", "Q 15,500.00", "Q 620.00", "Facturada"],
  ["09:18", "Honda Navi 2026", "Moto nueva", "Carlos Pérez", "Transferencia", "Q 18,990.00", "Pendiente", "Facturada"],
  ["10:42", "Casco LS2 Stream Evo", "Accesorio", "María López", "Tarjeta", "Q 1,250.00", "Q 31.25", "Facturada"],
  ["11:30", "Guantes + Jersey Fox", "Accesorio", "María López", "Efectivo", "Q 1,075.00", "Q 26.88", "No facturada"],
];

// ─── helpers ───────────────────────────────────────────────────────────────

const ONES = ["", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez", "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve"];
const TENS = ["", "", "veinte", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
const HUNDS = ["", "cien", "doscientos", "trescientos", "cuatrocientos", "quinientos", "seiscientos", "setecientos", "ochocientos", "novecientos"];

function intToWords(n: number): string {
  if (n === 0) return "cero";
  if (n < 20) return ONES[n];
  if (n < 100) { const t = Math.floor(n / 10), o = n % 10; return t === 2 && o > 0 ? "veinti" + ONES[o] : TENS[t] + (o ? " y " + ONES[o] : ""); }
  if (n === 100) return "cien";
  if (n < 1000) { const h = Math.floor(n / 100), r = n % 100; return (h === 1 ? "ciento" : HUNDS[h]) + (r ? " " + intToWords(r) : ""); }
  if (n < 2000) { const r = n % 1000; return "mil" + (r ? " " + intToWords(r) : ""); }
  if (n < 1000000) { const m = Math.floor(n / 1000), r = n % 1000; return intToWords(m) + " mil" + (r ? " " + intToWords(r) : ""); }
  return n.toString();
}

function numberToWords(n: number): string {
  const int = Math.floor(n);
  const dec = Math.round((n - int) * 100);
  const w = intToWords(int);
  return (w.charAt(0).toUpperCase() + w.slice(1)) + ` quetzales con ${dec.toString().padStart(2, "0")}/100`;
}

function fmtQ(n: number) { return "Q " + n.toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

// ─── commission defaults ────────────────────────────────────────────────────

const COMM_DEFAULT: Record<string, string> = { "Accesorio": "2.5", "Repuesto": "2.5", "Moto nueva": "", "Moto usada": "", "Otro": "" };

// ─── sidebar ────────────────────────────────────────────────────────────────

function Sidebar({ active, role, onNavigate }: { active: Screen; role: Role; onNavigate: (screen: Screen) => void }) {
  const nav = role === "Administrador" ? adminNav : employeeNav;
  return <aside className="sidebar">
    <div className="brand"><img className="brand-logo" src={logo} alt="SoloMotos" /><div className="brand-subtitle">Sistema de Ventas</div></div>
    <nav className="nav-list">{nav.map((item) => <UnstyledButton key={item.id} className={`nav-item ${active === item.id ? "active" : ""}`} onClick={() => onNavigate(item.id)}><Icon name={item.icon} size="sm" /><span>{role === "Empleado" && item.id === "history" ? "Historial del día" : item.label}</span></UnstyledButton>)}</nav>
    <div className="sidebar-help"><div className="sidebar-help-icon"><Icon name="wrench" size="sm" /></div><div><strong>¿Necesitas ayuda?</strong><span>Contacta al administrador</span></div></div>
  </aside>;
}

// ─── header ─────────────────────────────────────────────────────────────────

// Fecha actual; se refresca cada minuto para que cambie sola al pasar la medianoche
function useToday() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const LONG_DATE = new Intl.DateTimeFormat("es-GT", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const SHORT_DATE = new Intl.DateTimeFormat("es-GT", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const SALE_DATE = new Intl.DateTimeFormat("es-GT", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
const SALE_TIME = new Intl.DateTimeFormat("es-GT", { hour: "2-digit", minute: "2-digit", hour12: false });

function Header({ screen, role, dark, onToggleDark, onLogout }: { screen: Screen; role: Role; dark: boolean; onToggleDark: () => void; onLogout: () => void }) {
  const today = useToday();
  const longDate = capitalize(LONG_DATE.format(today));
  return <header className="topbar">
    <div className="topbar-heading"><div className="page-kicker">SoloMotos / {names[screen]}</div><div className="page-title" title={names[screen]}>{names[screen]}</div></div>
    <div className="top-actions">
      <div className="date-pill" title={longDate}><Icon name="calendar" size="sm" /><span className="date-long">{longDate}</span><span className="date-short">{capitalize(SHORT_DATE.format(today))}</span></div>
      <IconButton icon="bell" label="Notificaciones" />
      <IconButton icon={dark ? "sun" : "moon"} label={dark ? "Tema claro" : "Tema oscuro"} onClick={onToggleDark} />
      <div className="user-menu" title={role}><div className="avatar"><Icon name="users" size="sm" /></div><div className="user-menu-name"><strong>{role}</strong></div></div>
      <IconButton icon="logout" label="Cerrar sesión" onClick={onLogout} />
    </div>
  </header>;
}

// ─── kpi card ───────────────────────────────────────────────────────────────

function KpiCard({ icon, label, value, foot, tone = "dark" }: { icon: IconName; label: string; value: string; foot: string; tone?: string }) {
  return <Card className="kpi-card"><div className={`kpi-icon tone-${tone}`}><Icon name={icon} /></div><div className="kpi-label">{label}</div><div className="kpi-value">{value}</div><div className={`kpi-foot ${foot.startsWith("+") ? "positive" : ""}`}>{foot}</div></Card>;
}

// ─── dashboard ──────────────────────────────────────────────────────────────

function Dashboard({ onNewSale }: { onNewSale: () => void }) {
  // Solo dos opciones fijas: un combobox es lo más directo
  const [sellerMonth, setSellerMonth] = useState("Este mes");
  const sellerMonthLabel = fmtMonth(addMonths(new Date(), sellerMonth === "Este mes" ? 0 : -1));
  return <div className="screen-stack">
    <div className="hero-row"><div><div className="section-title">Buenos días</div><div className="muted">Este es el resumen de tu negocio al día de hoy.</div></div><Button icon="plus" onClick={onNewSale}>Nueva venta</Button></div>
    <div className="kpi-grid">
      <KpiCard icon="cash" label="Ventas del día" value="Q 36,815.00" foot="+12.5% vs. ayer" tone="orange" />
      <KpiCard icon="trending" label="Ventas del mes" value="Q 284,650.00" foot="+8.2% vs. mes anterior" tone="blue" />
      <KpiCard icon="coins" label="Comisiones del mes" value="Q 9,845.75" foot="3 ventas con comisión pendiente" tone="purple" />
      <KpiCard icon="receipt" label="Gastos del mes" value="Q 48,320.00" foot="8 gastos registrados" tone="red" />
      <KpiCard icon="file" label="Facturas emitidas" value="148 / 200" foot="74% del límite mensual" tone="green" />
    </div>
    <div className="dashboard-grid">
      <Card className="chart-card"><div className="card-heading"><div><div className="card-title">Ventas por vendedor</div><div className="muted small">{sellerMonthLabel} · monto vendido</div></div><Select value={sellerMonth} options={["Este mes", "Mes anterior"]} onChange={setSellerMonth} /></div>
        <div className="bar-chart"><div className="y-axis"><span>Q 120k</span><span>Q 80k</span><span>Q 40k</span><span>Q 0</span></div><div className="bars"><div className="bar-group"><span className="bar bar-one" /><strong>Q 112,450</strong><small>María</small></div><div className="bar-group"><span className="bar bar-two" /><strong>Q 98,700</strong><small>Carlos</small></div><div className="bar-group"><span className="bar bar-three" /><strong>Q 73,500</strong><small>José</small></div></div></div>
        <div className="chart-summary"><span><i className="dot orange" /> 31 ventas totales</span><span>Ticket promedio <strong>Q 9,182.26</strong></span></div>
      </Card>
      <Card className="chart-card"><div className="card-heading"><div><div className="card-title">Ventas vs. gastos</div><div className="muted small">Comportamiento durante el mes</div></div><div className="legend"><span><i className="dot orange" /> Ventas</span><span><i className="dot gray" /> Gastos</span></div></div>
        <div className="line-chart"><div className="grid-lines"><span/><span/><span/><span/></div><svg viewBox="0 0 520 190" preserveAspectRatio="none"><path className="area-path" d="M0 160 C55 145 75 120 120 126 S190 75 245 90 S310 30 365 58 S445 30 520 20 L520 190 L0 190Z"/><path className="sales-path" d="M0 160 C55 145 75 120 120 126 S190 75 245 90 S310 30 365 58 S445 30 520 20"/><path className="expense-path" d="M0 170 C80 165 110 155 165 160 S250 145 310 153 S390 138 440 145 S490 130 520 136"/></svg><div className="x-labels"><span>1 Sep</span><span>7 Sep</span><span>14 Sep</span><span>21 Sep</span><span>28 Sep</span></div></div>
      </Card>
    </div>
    <div className="bottom-grid"><Card><div className="card-heading"><div><div className="card-title">Ventas recientes</div><div className="muted small">Últimos movimientos registrados</div></div><Button variant="ghost">Ver historial</Button></div><SalesTable compact={true} /></Card>
      <Card className="invoice-limit"><div className="card-title">Control de facturas</div><div className="radial"><div><strong>74%</strong><span>utilizado</span></div></div><div className="limit-stats"><div><span>Emitidas</span><strong>148</strong></div><div><span>Disponibles</span><strong>52</strong></div></div><div className="notice"><Icon name="file" size="sm" /><span>Te quedan 52 facturas disponibles este mes.</span></div></Card></div>
  </div>;
}

// ─── segmented ──────────────────────────────────────────────────────────────

function Segmented({ options, value, onChange, icons }: { options: string[]; value: string; onChange: (value: string) => void; icons?: IconName[] }) {
  return <div className="segmented">{options.map((option, index) => <UnstyledButton key={option} className={value === option ? "selected" : ""} onClick={() => onChange(option)}>{icons && <Icon name={icons[index]} size="sm" />}<span>{option}</span></UnstyledButton>)}</div>;
}

// ─── new sale ───────────────────────────────────────────────────────────────

type SaleItem = { id: number; desc: string; cat: string; qty: number; price: number; commission: string };

const CATS = ["Moto nueva", "Moto usada", "Accesorio", "Repuesto", "Otro"];
const ACTIVE_SELLERS = ["María López", "Carlos Pérez", "José Méndez"];

const INITIAL_ITEMS: SaleItem[] = [
  { id: 1, desc: "Casco LS2 Stream Evo", cat: "Accesorio", qty: 1, price: 1250, commission: "2.5" },
];

function ItemsTable({ items, setItems, isAdmin }: { items: SaleItem[]; setItems: (items: SaleItem[]) => void; isAdmin: boolean }) {
  const update = (id: number, field: keyof SaleItem, val: string | number) => {
    setItems(items.map((item) => {
      if (item.id !== id) return item;
      const updated = { ...item, [field]: val };
      if (field === "cat") updated.commission = COMM_DEFAULT[val as string] ?? "";
      return updated;
    }));
  };
  const addItem = () => setItems([...items, { id: Date.now(), desc: "", cat: "Accesorio", qty: 1, price: 0, commission: "2.5" }]);
  const remove = (id: number) => setItems(items.filter((i) => i.id !== id));

  return <div className="items-table-wrap">
    <table className="items-table">
      <thead><tr>
        <th>Descripción</th>
        <th>Categoría</th>
        <th>Cant.</th>
        <th>Precio unit.</th>
        <th>Subtotal</th>
        {isAdmin && <th>Comisión %</th>}
        <th />
      </tr></thead>
      <tbody>{items.map((item) => {
        const sub = item.qty * item.price;
        return <tr key={item.id}>
          <td><input className="cell-input wide" value={item.desc} onChange={(e) => update(item.id, "desc", e.target.value)} placeholder="Descripción" /></td>
          <td><select className="cell-select" value={item.cat} onChange={(e) => update(item.id, "cat", e.target.value)}>{CATS.map((c) => <option key={c}>{c}</option>)}</select></td>
          <td><input className="cell-input narrow" type="number" min={1} value={item.qty} onChange={(e) => update(item.id, "qty", Number(e.target.value))} /></td>
          <td><input className="cell-input" value={item.price === 0 ? "" : item.price.toString()} onChange={(e) => update(item.id, "price", Number(e.target.value.replace(/[^0-9.]/g, "")))} placeholder="0.00" /></td>
          <td className="cell-amount">{fmtQ(sub)}</td>
          {isAdmin && <td><div className="comm-cell">{item.commission !== "" ? <input className="cell-input narrow" value={item.commission} onChange={(e) => update(item.id, "commission", e.target.value)} /> : <span className="badge badge-neutral">Pendiente</span>}</div></td>}
          <td><button type="button" className="icon-button" onClick={() => remove(item.id)} aria-label="Quitar"><Icon name="trash" size="sm" /></button></td>
        </tr>;
      })}</tbody>
    </table>
    <button type="button" className="add-item-btn" onClick={addItem}><Icon name="plus" size="sm" /><span>Agregar artículo</span></button>
  </div>;
}

function InvoicePreview({ items, payment, seller, clientId, idType, clientName, clientAddr, total, observations, onNewSale }:
  { items: SaleItem[]; payment: string; seller: string; clientId: string; idType: string; clientName: string; clientAddr: string; total: number; observations: string; onNewSale: () => void }) {
  const now = "14/09/2026 · 10:42";
  const uuid = "DB4A-849F-11EF-8C9A-00163E002C4F";
  const serie = "FEL-A";
  const numDte = "00148";
  const numAut = uuid;
  return <div className="invoice-page">
    <div className="invoice-actions">
      <div />
      <div><Button variant="secondary" icon="download">Descargar PDF</Button><Button icon="print">Imprimir</Button><Button variant="secondary" onClick={onNewSale}>Registrar otra venta</Button></div>
    </div>
    <div className="invoice-sheet">
      <div className="invoice-head">
        <div className="invoice-brand"><img className="brand-logo" src={logo} alt="SoloMotos" /><span>Pasión que te mueve</span></div>
        <div className="invoice-meta"><Badge tone="success">FACTURA FEL</Badge><strong>No. SM-{numDte}</strong><span>Fecha: {now}</span></div>
      </div>
      <div className="invoice-company">
        <div><strong>SoloMotos Quetzaltenango</strong><span>NIT: 8214573-6</span><span>7a. calle 4-63, zona 2, Quetzaltenango</span><span>Tel. +502 7765 4321</span></div>
        <div><span>Vendedor</span><strong>{seller}</strong></div>
      </div>
      <div className="client-box">
        <div><span>{idType}</span><strong>{clientId}</strong></div>
        <div><span>Nombre / Razón social</span><strong>{clientName}</strong></div>
        <div><span>Dirección fiscal</span><strong>{clientAddr}</strong></div>
      </div>
      <div className="invoice-table">
        <div className="invoice-tr invoice-th"><span>Cant.</span><span>Descripción</span><span>Precio unit.</span><span>Subtotal</span></div>
        {items.map((item) => <div key={item.id} className="invoice-tr"><span>{item.qty}</span><span><strong>{item.desc}</strong><small>{item.cat}</small></span><span>{fmtQ(item.price)}</span><span><strong>{fmtQ(item.qty * item.price)}</strong></span></div>)}
      </div>
      <div className="invoice-total">
        <div><span>Método de pago</span><strong>{payment}</strong></div>
        <div><span>Total</span><strong>{fmtQ(total)}</strong></div>
        <div className="total-words"><span>Son:</span><span>{numberToWords(total)}</span></div>
      </div>
      {observations && <div className="invoice-obs"><span>Observaciones:</span><span>{observations}</span></div>}
      <div className="fel-block">
        <div className="fel-title"><Icon name="file" size="sm" /> Datos de certificación FEL</div>
        <div className="fel-grid">
          <div><span>Serie</span><strong>{serie}</strong></div>
          <div><span>Número de DTE</span><strong>{numDte}</strong></div>
          <div className="fel-uuid"><span>Número de autorización</span><strong>{numAut}</strong></div>
          <div><span>Fecha y hora de certificación</span><strong>{now}</strong></div>
        </div>
      </div>
      <div className="invoice-footer"><span>Gracias por preferir SoloMotos.</span><span>Documento tributario electrónico autorizado por la SAT.</span></div>
    </div>
  </div>;
}

function SaleSuccess({ total, onNewSale, onHistory }: { total: number; onNewSale: () => void; onHistory: () => void }) {
  return <div className="success-full">
    <div className="success-icon"><Icon name="check" /></div>
    <div className="success-title">Venta registrada correctamente</div>
    <div className="success-sub success-no-invoice">(sin factura)</div>
    <div className="success-amount">{fmtQ(total)}</div>
    <div className="success-actions">
      <Button onClick={onNewSale}>Registrar otra venta</Button>
      <Button variant="secondary" onClick={onHistory}>Ver ventas</Button>
    </div>
  </div>;
}

function NewSale({ role, onHistory }: { role: Role; onHistory: () => void }) {
  const isAdmin = role === "Administrador";
  // Solo lectura a propósito: la hora la pone el sistema (RNF 3.2), no se elige con calendario
  const now = useToday();
  const saleTimestamp = `${capitalize(SALE_DATE.format(now))} · ${SALE_TIME.format(now)}`;
  const [items, setItems] = useState<SaleItem[]>(INITIAL_ITEMS);
  const [seller, setSeller] = useState("María López");
  const [payment, setPayment] = useState("Tarjeta");
  const [doInvoice, setDoInvoice] = useState(true);
  const [idType, setIdType] = useState<"NIT" | "CUI">("NIT");
  const [clientId, setClientId] = useState("5489632-1");
  const [clientName, setClientName] = useState("Daniel Fuentes Castillo");
  const [clientAddr, setClientAddr] = useState("5a. calle 12-40, zona 3, Quetzaltenango");
  const [observations, setObservations] = useState("");
  const [modal, setModal] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const total = items.reduce((s, i) => s + i.qty * i.price, 0);
  const isCF = clientId.trim().toUpperCase() === "CF";
  const cfWarning = doInvoice && isCF && total >= 2500;

  const resetSale = () => {
    setItems(INITIAL_ITEMS);
    setSeller("María López");
    setPayment("Tarjeta");
    setDoInvoice(true);
    setIdType("NIT");
    setClientId("5489632-1");
    setClientName("Daniel Fuentes Castillo");
    setClientAddr("5a. calle 12-40, zona 3, Quetzaltenango");
    setObservations("");
    setConfirmed(false);
  };

  const fillCF = () => { setClientId("CF"); setClientName("Consumidor Final"); setClientAddr("Ciudad"); };

  const totalCommission = isAdmin ? items.reduce((s, i) => {
    const pct = parseFloat(i.commission);
    return s + (isNaN(pct) ? 0 : i.qty * i.price * pct / 100);
  }, 0) : 0;

  if (confirmed) {
    if (doInvoice) {
      return <InvoicePreview items={items} payment={payment} seller={seller} clientId={clientId} idType={idType} clientName={clientName} clientAddr={clientAddr} total={total} observations={observations} onNewSale={resetSale} />;
    }
    return <SaleSuccess total={total} onNewSale={resetSale} onHistory={onHistory} />;
  }

  return <div className="sale-layout">
    <div className="sale-main screen-stack">
      <Card className="form-card">
        <div className="form-section-title"><span>1</span><div><strong>Datos de la venta</strong><small>Información principal de la operación</small></div></div>
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
          <Segmented options={["Efectivo", "Transferencia", "Tarjeta"]} value={payment} onChange={setPayment} icons={["cash", "bank", "card"]} />
        </div>
      </Card>

      <Card className="form-card">
        <div className="form-section-title"><span>2</span><div><strong>Artículos</strong><small>Productos o servicios incluidos en esta venta</small></div></div>
        <ItemsTable items={items} setItems={setItems} isAdmin={isAdmin} />
      </Card>

      <Card className="form-card">
        <div className="invoice-toggle">
          <div><div className="card-title">Facturación</div><div className="muted small">Se emitirá una factura electrónica FEL</div></div>
          <Toggle checked={doInvoice} onChange={setDoInvoice} label="¿Facturar esta venta?" />
        </div>
        {doInvoice && <div className="invoice-fields">
          <div className="section-divider" />
          <div className="form-section-title"><span>3</span><div><strong>Datos del cliente</strong><small>Información requerida para la factura</small></div></div>
          <div className="client-id-row">
            <div className="id-type-seg">
              <UnstyledButton className={idType === "NIT" ? "id-type-btn selected" : "id-type-btn"} onClick={() => setIdType("NIT")}>NIT</UnstyledButton>
              <UnstyledButton className={idType === "CUI" ? "id-type-btn selected" : "id-type-btn"} onClick={() => setIdType("CUI")}>CUI</UnstyledButton>
            </div>
            <TextInput placeholder={idType === "NIT" ? "Ej. 5489632-1" : "Ej. 2345 12345 0101"} value={clientId} onChange={setClientId} icon="search" />
            <button type="button" className="cf-btn" onClick={fillCF}>Consumidor Final (CF)</button>
          </div>
          {cfWarning && <div className="cf-warning"><Icon name="bell" size="sm" /><span>Para ventas de Q2,500.00 o más la SAT requiere NIT o CUI del comprador.</span></div>}
          <div className="form-grid two">
            <div className="span-two"><TextInput label="Nombre o razón social" value={clientName} onChange={setClientName} /></div>
            <div className="span-two"><TextInput label="Dirección fiscal" value={clientAddr} onChange={setClientAddr} /></div>
            <div className="span-two"><TextArea label="Observaciones en factura (opcional)" value={observations} onChange={setObservations} placeholder="Ej. Crédito 30 días, referencia de pedido, etc." /></div>
          </div>
        </div>}
      </Card>
    </div>

    <aside className="sale-summary">
      <Card>
        <div className="summary-title">Resumen de venta</div>
        <div className="summary-items">
          {items.map((item) => <div key={item.id} className="summary-item-line">
            <span className="summary-item-desc">{item.desc || "—"} <span className="summary-item-qty">×{item.qty}</span></span>
            <strong>{fmtQ(item.qty * item.price)}</strong>
          </div>)}
        </div>
        <div className="summary-lines">
          <div><span>Subtotal</span><strong>{fmtQ(total)}</strong></div>
          <div><span>Método de pago</span><strong>{payment}</strong></div>
          {isAdmin && <div><span>Comisión estimada</span><strong>{fmtQ(totalCommission)}</strong></div>}
          <div><span>Factura FEL</span><Badge tone={doInvoice ? "success" : "neutral"}>{doInvoice ? "Sí" : "No"}</Badge></div>
        </div>
        <div className="summary-total"><span>Total</span><strong>{fmtQ(total)}</strong></div>
        <Button className="full-button" icon="check" onClick={() => setModal(true)}>Confirmar venta</Button>
        <div className="summary-note"><Icon name="lock" size="sm" /> Revisa los datos antes de confirmar</div>
      </Card>
    </aside>

    <Modal open={modal} title="Confirmar venta" onClose={() => setModal(false)} onConfirm={() => { setModal(false); setConfirmed(true); }} confirmLabel="Registrar venta">
      <div className="confirm-box">
        <div><span>Total</span><strong>{fmtQ(total)}</strong></div>
        <div><span>Vendedor</span><strong>{seller}</strong></div>
        <div><span>Método de pago</span><strong>{payment}</strong></div>
        {doInvoice && <div><span>Cliente</span><strong>{clientName}</strong></div>}
        <div><span>Factura FEL</span><strong>{doInvoice ? "Sí" : "No"}</strong></div>
      </div>
      <div className="modal-hint">{doInvoice ? "Al confirmar, la venta se guardará y se generará la factura FEL." : "Al confirmar, la venta se guardará sin factura."}</div>
    </Modal>
  </div>;
}

// ─── dashboard compact sales ──────────────────────────────────────────────────

function SalesTable({ compact = false }: { compact?: boolean }) {
  return <div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Producto</th><th>Vendedor</th><th>Monto</th><th>Estado</th></tr></thead><tbody>{sales.slice(0, compact ? 3 : 5).map((row) => <tr key={row[0] + row[1]}><td>{row[0]}</td><td><strong>{row[1]}</strong></td><td>{row[3]}</td><td><strong>{row[5]}</strong></td><td><Badge tone={row[7] === "Facturada" ? "success" : "neutral"}>{row[7]}</Badge></td></tr>)}</tbody></table></div>;
}

// ─── history ─────────────────────────────────────────────────────────────────

type HistorySale = { id: number; time: string; product: string; category: string; seller: string; payment: string; amount: number; commission: string; invoiced: boolean; locked: boolean };

const HISTORY_ROWS: HistorySale[] = [
  { id: 1, time: "14/09 · 08:55", product: "Yamaha FZ 2.0", category: "Moto usada", seller: "José Méndez", payment: "Transferencia", amount: 15500, commission: "Q 620.00", invoiced: true, locked: false },
  { id: 2, time: "14/09 · 09:18", product: "Honda Navi 2026", category: "Moto nueva", seller: "Carlos Pérez", payment: "Transferencia", amount: 18990, commission: "Pendiente", invoiced: true, locked: false },
  { id: 3, time: "14/09 · 10:42", product: "Casco LS2 Stream Evo", category: "Accesorio", seller: "María López", payment: "Tarjeta", amount: 1250, commission: "Q 31.25", invoiced: true, locked: false },
  { id: 4, time: "14/09 · 11:30", product: "Guantes Alpinestars + Jersey Fox (2 art.)", category: "Accesorio", seller: "María López", payment: "Efectivo", amount: 1075, commission: "Q 26.88", invoiced: false, locked: false },
  { id: 5, time: "29/08 · 11:20", product: "Kit de arrastre", category: "Repuesto", seller: "Carlos Pérez", payment: "Efectivo", amount: 895, commission: "Q 22.38", invoiced: false, locked: true },
];

function AssignModal({ open, saleProduct, saleAmount, onClose, onConfirm }: { open: boolean; saleProduct: string; saleAmount: number; onClose: () => void; onConfirm: (pct: string) => void }) {
  const [pct, setPct] = useState("4.0");
  const calc = isNaN(parseFloat(pct)) ? 0 : saleAmount * parseFloat(pct) / 100;
  return <Modal open={open} title="Asignar comisión" onClose={onClose} onConfirm={() => onConfirm(pct)} confirmLabel="Guardar comisión">
    <div className="muted small" style={{ marginBottom: 14 }}>{saleProduct} · {fmtQ(saleAmount)}</div>
    <TextInput label="Porcentaje de comisión (%)" value={pct} onChange={setPct} />
    <div className="commission-calc" style={{ marginTop: 12 }}><span>Comisión calculada</span><strong>{fmtQ(calc)}</strong></div>
  </Modal>;
}

function History({ role, onInvoice }: { role: Role; onInvoice: () => void }) {
  const isAdmin = role === "Administrador";
  const [rows, setRows] = useState<HistorySale[]>(HISTORY_ROWS);
  const [assignTarget, setAssignTarget] = useState<HistorySale | null>(null);
  const [range, setRange] = useState<DateRange>(() => presetRange("Últimos 30 días"));

  const handleAssign = (pct: string) => {
    if (!assignTarget) return;
    const calc = assignTarget.amount * parseFloat(pct) / 100;
    setRows(rows.map((r) => r.id === assignTarget.id ? { ...r, commission: fmtQ(calc) } : r));
    setAssignTarget(null);
  };

  const todayRows = rows.filter((r) => r.time.startsWith("14/09"));

  return <div className="screen-stack">
    <div className="hero-row">
      <div>
        <div className="section-title">{isAdmin ? "Historial de ventas" : "Ventas de hoy"}</div>
        <div className="muted">{isAdmin ? "Consulta, filtra y administra las ventas registradas." : "Ventas registradas el lunes 14 de septiembre de 2026."}</div>
      </div>
      {isAdmin && <Button icon="download" variant="secondary">Exportar</Button>}
    </div>

    {isAdmin && <Card className="history-filters">
      <TextInput placeholder="Buscar por producto, vendedor..." icon="search" />
      <DateRangePicker value={range} onChange={setRange} />
      <Select value="Todos los vendedores" options={["Todos los vendedores", "María López", "Carlos Pérez", "José Méndez"]} />
      <Select value="Todas las categorías" options={["Todas las categorías", "Moto nueva", "Moto usada", "Accesorio", "Repuesto", "Otro"]} />
      <Select value="Cualquier pago" options={["Cualquier pago", "Efectivo", "Transferencia", "Tarjeta"]} />
      <Select value="Cualquier estado" options={["Cualquier estado", "Facturada", "No facturada"]} />
      <label className="filter-check"><input type="checkbox" /><span>Comisión pendiente</span></label>
    </Card>}

    <Card>
      <div className="table-wrap">
        <table>
          <thead><tr>
            {isAdmin ? <>
              <th>Fecha / Hora</th><th>Producto</th><th>Categoría</th><th>Vendedor</th><th>Pago</th><th>Monto</th><th>Comisión</th><th>Factura</th><th>Acciones</th>
            </> : <>
              <th>Hora</th><th>Producto</th><th>Categoría</th><th>Vendedor</th><th>Pago</th><th>Monto</th><th>Factura</th><th>Acciones</th>
            </>}
          </tr></thead>
          <tbody>{(isAdmin ? rows : todayRows).map((row) => (
            <tr key={row.id} className={row.locked ? "locked-row" : ""}>
              <td>{row.locked && <Icon name="lock" size="sm" />} {row.time}</td>
              <td><strong>{row.product}</strong></td>
              <td>{row.category}</td>
              <td>{row.seller}</td>
              <td>{row.payment}</td>
              <td><strong>{fmtQ(row.amount)}</strong></td>
              {isAdmin && <td>
                {row.locked ? <span className="muted">{row.commission}</span>
                  : row.commission === "Pendiente"
                  ? <button type="button" className="assign-chip" onClick={() => setAssignTarget(row)}>Asignar</button>
                  : row.commission}
              </td>}
              <td><Badge tone={row.invoiced ? "success" : "neutral"}>{row.invoiced ? "Facturada" : "No facturada"}</Badge></td>
              <td>
                {row.locked ? <Badge tone="neutral">Cerrado</Badge> : <div className="row-actions">
                  {row.invoiced && <button type="button" className="icon-button" title="Ver factura" onClick={onInvoice}><Icon name="file" size="sm" /></button>}
                  {isAdmin && <><IconButton icon="edit" label="Editar" /><IconButton icon="trash" label="Eliminar" /></>}
                </div>}
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div className="pagination"><span>Mostrando 1–5 de 31 ventas</span><div><Button variant="secondary">Anterior</Button><Button variant="secondary">Siguiente</Button></div></div>
    </Card>

    {assignTarget && <AssignModal open={true} saleProduct={assignTarget.product} saleAmount={assignTarget.amount} onClose={() => setAssignTarget(null)} onConfirm={handleAssign} />}
  </div>;
}

// ─── workshop ────────────────────────────────────────────────────────────────

type WStatus = "Recibida" | "En reparación" | "Lista para entregar" | "Entregada";
type WorkOrder = { id: string; client: string; phone: string; moto: string; work: string; mechanic: string; status: WStatus; cost: number; costType: "estimado" | "final" | "cobrado"; log: { ts: string; event: string }[] };

const WSTATUS_ORDER: WStatus[] = ["Recibida", "En reparación", "Lista para entregar", "Entregada"];
const WSTATUS_TONE: Record<WStatus, "neutral" | "warning" | "success" | "info"> = { "Recibida": "neutral", "En reparación": "warning", "Lista para entregar": "success", "Entregada": "info" };
const ACTIVE_MECHS = ["Mario Hernández", "Pedro Ajú", "Julio Tzul", "Érick Chávez"];

const INIT_ORDERS: WorkOrder[] = [
  { id: "SM-1048", client: "Byron Sic", phone: "5512-3344", moto: "Honda CB190R · P-482JDM", work: "Cambio de aceite y ajuste de cadena", mechanic: "Mario Hernández", status: "Recibida", cost: 450, costType: "estimado", log: [{ ts: "14/09/2026 08:20", event: "Orden recibida" }] },
  { id: "SM-1047", client: "Ana López", phone: "4123-8890", moto: "Yamaha FZ · M-923HJK", work: "Revisión de sistema eléctrico", mechanic: "Pedro Ajú", status: "En reparación", cost: 780, costType: "estimado", log: [{ ts: "13/09/2026 15:40", event: "Orden recibida" }, { ts: "14/09/2026 09:05", event: "Pasó a En reparación" }] },
  { id: "SM-1046", client: "Roberto Díaz", phone: "3301-2275", moto: "Suzuki GN125 · M-876KLF", work: "Servicio completo", mechanic: "Mario Hernández", status: "En reparación", cost: 650, costType: "estimado", log: [{ ts: "14/09/2026 07:55", event: "Orden recibida" }, { ts: "14/09/2026 08:30", event: "Pasó a En reparación" }] },
  { id: "SM-1045", client: "Sandra Pérez", phone: "5876-4410", moto: "Italika FT150 · M-311BCD", work: "Cambio de llantas", mechanic: "Julio Tzul", status: "Lista para entregar", cost: 1150, costType: "final", log: [{ ts: "13/09/2026 10:00", event: "Orden recibida" }, { ts: "13/09/2026 14:20", event: "Pasó a En reparación" }, { ts: "14/09/2026 10:30", event: "Lista para entregar · costo final: Q1,150.00" }] },
  { id: "SM-1044", client: "Kevin Coyoy", phone: "4450-9021", moto: "Bajaj Pulsar NS200 · M-557PQR", work: "Cambio de frenos", mechanic: "Érick Chávez", status: "Entregada", cost: 680, costType: "cobrado", log: [{ ts: "13/09/2026 09:00", event: "Orden recibida" }, { ts: "13/09/2026 11:00", event: "Pasó a En reparación" }, { ts: "13/09/2026 15:30", event: "Lista para entregar · costo final: Q680.00" }, { ts: "13/09/2026 17:00", event: "Entregada y cobrada" }] },
];

function EmployeeHome({ onNewSale, onInvoice, onViewOrder }: { onNewSale: () => void; onInvoice: () => void; onViewOrder: (id: string) => void }) {
  const todaySales = HISTORY_ROWS.filter((sale) => sale.time.startsWith("14/09")).reverse();
  const activeOrders = INIT_ORDERS.filter((order) => order.status !== "Entregada");
  const readyOrders = activeOrders.filter((order) => order.status === "Lista para entregar");
  const invoicesIssued = 148;
  const monthlyInvoiceLimit = 200;

  return <div className="screen-stack employee-home">
    <div className="hero-row employee-home-hero">
      <div><div className="section-title">Buenos días</div><div className="muted">Este es el resumen de hoy, lunes 14 de septiembre de 2026.</div></div>
      <Button icon="plus" className="employee-new-sale" onClick={onNewSale}>Nueva venta</Button>
    </div>
    <Card className="employee-sales-count"><div className="kpi-icon tone-orange"><Icon name="history" /></div><div><div className="kpi-label">Ventas registradas hoy</div><div className="employee-count">{todaySales.length}</div></div></Card>
    <Card>
      <div className="card-title">Últimas ventas de hoy</div>
      <div className="table-wrap"><table><thead><tr><th>Hora</th><th>Producto</th><th>Vendedor</th><th>Factura</th></tr></thead>
        <tbody>{todaySales.map((sale) => <tr key={sale.id}>
          <td>{sale.time.split(" · ")[1]}</td><td><strong>{sale.product}</strong></td><td>{sale.seller}</td>
          <td><div className="employee-invoice-cell"><Badge tone={sale.invoiced ? "success" : "neutral"}>{sale.invoiced ? "Facturada" : "No facturada"}</Badge>{sale.invoiced && <IconButton icon="file" label="Ver factura" onClick={onInvoice} />}</div></td>
        </tr>)}</tbody>
      </table></div>
    </Card>
    <div className="employee-workshop"><div className="card-title">Taller hoy</div>
      <div className="employee-workshop-stats">
        <Card><span>Recibidas</span><strong>{activeOrders.filter((order) => order.status === "Recibida").length}</strong></Card>
        <Card><span>En reparación</span><strong>{activeOrders.filter((order) => order.status === "En reparación").length}</strong></Card>
        <Card className="employee-ready-stat"><span>Listas para entregar</span><strong>{readyOrders.length}</strong></Card>
      </div>
      <Card><div className="card-title">Listas para entregar</div>
        {readyOrders.map((order) => <div className="employee-ready-order" key={order.id}>
          <div><strong>{order.id}</strong><span>{order.client} · {order.moto}</span></div>
          <Button variant="secondary" onClick={() => onViewOrder(order.id)}>Ver orden</Button>
        </div>)}
      </Card>
    </div>
    {invoicesIssued / monthlyInvoiceLimit > 0.8 && <div className="employee-invoice-warning" role="status"><Icon name="file" size="sm" /><span>Quedan pocas facturas disponibles este mes. Consulta con administración antes de facturar.</span></div>}
  </div>;
}

function OrderDetail({ order, isAdmin, onBack, onUpdate }: { order: WorkOrder; isAdmin: boolean; onBack: () => void; onUpdate: (o: WorkOrder) => void }) {
  const idx = WSTATUS_ORDER.indexOf(order.status);
  const next = WSTATUS_ORDER[idx + 1] as WStatus | undefined;
  const [finalCost, setFinalCost] = useState(order.cost.toString());
  const [askFinal, setAskFinal] = useState(false);
  const [cobrarModal, setCobrarModal] = useState(false);
  const [cobrarPayment, setCobrarPayment] = useState("Efectivo");
  const [cobrarInvoice, setCobrarInvoice] = useState(false);
  const [cobrarIdType, setCobrarIdType] = useState<"NIT" | "CUI">("NIT");
  const [cobrarId, setCobrarId] = useState("");
  const [cobrarName, setCobrarName] = useState(order.client);
  const [cobrarAddr, setCobrarAddr] = useState("");
  const cobrarCF = cobrarId.toUpperCase() === "CF";
  const cobrarTotal = parseFloat(finalCost) || 0;

  const advance = () => {
    if (!next) return;
    if (next === "Lista para entregar") { setAskFinal(true); return; }
    if (next === "Entregada") { setCobrarModal(true); return; }
    const ts = "14/09/2026 " + new Date().toTimeString().slice(0, 5);
    onUpdate({ ...order, status: next, log: [...order.log, { ts, event: `Pasó a ${next}` }] });
  };

  const confirmFinal = () => {
    const c = parseFloat(finalCost) || order.cost;
    const ts = "14/09/2026 " + new Date().toTimeString().slice(0, 5);
    onUpdate({ ...order, status: "Lista para entregar", cost: c, costType: "final", log: [...order.log, { ts, event: `Lista para entregar · costo final: ${fmtQ(c)}` }] });
    setAskFinal(false);
  };

  const confirmCobro = () => {
    const c = parseFloat(finalCost) || order.cost;
    const ts = "14/09/2026 " + new Date().toTimeString().slice(0, 5);
    onUpdate({ ...order, status: "Entregada", cost: c, costType: "cobrado", log: [...order.log, { ts, event: "Entregada y cobrada" }] });
    setCobrarModal(false);
  };

  return <div className="screen-stack">
    <div className="hero-row">
      <div className="order-back"><button type="button" className="back-btn" onClick={onBack}><Icon name="chevron" size="sm" /></button><div><div className="section-title">{order.id}</div><div className="muted">{order.client} · {order.moto}</div></div></div>
      <div className="row-actions">
        {isAdmin && <><IconButton icon="edit" label="Editar" /><IconButton icon="trash" label="Eliminar" /></>}
        {next && <Button icon="check" onClick={advance}>{next === "Entregada" ? "Cobrar y entregar" : `Pasar a: ${next}`}</Button>}
      </div>
    </div>

    <div className="step-indicator">
      {WSTATUS_ORDER.map((s, i) => <div key={s} className={`step ${i <= idx ? "done" : ""} ${i === idx ? "current" : ""}`}>
        <div className="step-dot">{i < idx ? <Icon name="check" size="sm" /> : <span>{i + 1}</span>}</div>
        <div className="step-label">{s}</div>
        {i < WSTATUS_ORDER.length - 1 && <div className="step-line" />}
      </div>)}
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
          <div><span>Costo</span><strong>{fmtQ(order.cost)} <span className="cost-type">({order.costType})</span></strong></div>
        </div>
      </Card>
      <Card>
        <div className="card-title" style={{ marginBottom: 16 }}>Bitácora</div>
        <div className="order-log">{order.log.map((e, i) => <div key={i} className="log-entry"><div className="log-dot" /><div><strong>{e.ts}</strong><span>{e.event}</span></div></div>)}</div>
      </Card>
    </div>

    <Modal open={askFinal} title="Ingresar costo final" onClose={() => setAskFinal(false)} onConfirm={confirmFinal} confirmLabel="Confirmar">
      <TextInput label="Costo final del servicio" value={finalCost} onChange={setFinalCost} />
      <div className="modal-hint">Este será el monto que se cobró al cliente.</div>
    </Modal>

    <Modal open={cobrarModal} title="Cobrar y entregar" onClose={() => setCobrarModal(false)} onConfirm={confirmCobro} confirmLabel="Confirmar cobro">
      <div className="form-grid two">
        <div className="span-two"><TextInput label="Costo final cobrado" value={finalCost} onChange={setFinalCost} /></div>
        <div className="span-two">
          <div className="field-label" style={{ marginBottom: 8 }}>Método de pago</div>
          <Segmented options={["Efectivo", "Transferencia", "Tarjeta"]} value={cobrarPayment} onChange={setCobrarPayment} icons={["cash", "bank", "card"]} />
        </div>
      </div>
      <div style={{ marginTop: 16 }}>
        <Toggle checked={cobrarInvoice} onChange={setCobrarInvoice} label="¿Facturar este servicio?" />
      </div>
      {cobrarInvoice && <div style={{ marginTop: 16 }} className="screen-stack">
        <div className="client-id-row">
          <div className="id-type-seg">
            <UnstyledButton className={cobrarIdType === "NIT" ? "id-type-btn selected" : "id-type-btn"} onClick={() => setCobrarIdType("NIT")}>NIT</UnstyledButton>
            <UnstyledButton className={cobrarIdType === "CUI" ? "id-type-btn selected" : "id-type-btn"} onClick={() => setCobrarIdType("CUI")}>CUI</UnstyledButton>
          </div>
          <TextInput placeholder={cobrarIdType === "NIT" ? "Ej. 5489632-1" : "Ej. 2345 12345 0101"} value={cobrarId} onChange={setCobrarId} icon="search" />
          <button type="button" className="cf-btn" onClick={() => { setCobrarId("CF"); setCobrarName("Consumidor Final"); setCobrarAddr("Ciudad"); }}>CF</button>
        </div>
        {cobrarInvoice && cobrarCF && cobrarTotal >= 2500 && <div className="cf-warning"><Icon name="bell" size="sm" /><span>Para ventas de Q2,500.00 o más la SAT requiere NIT o CUI del comprador.</span></div>}
        <TextInput label="Nombre o razón social" value={cobrarName} onChange={setCobrarName} />
        <TextInput label="Dirección fiscal" value={cobrarAddr} onChange={setCobrarAddr} />
      </div>}
    </Modal>
  </div>;
}

function Workshop({ role, initialOrderId = null }: { role: Role; initialOrderId?: string | null }) {
  const isAdmin = role === "Administrador";
  const [orders, setOrders] = useState<WorkOrder[]>(INIT_ORDERS);
  const [tab, setTab] = useState<"activas" | "historial">("activas");
  const [newModal, setNewModal] = useState(false);
  const [detail, setDetail] = useState<string | null>(initialOrderId);
  const [search, setSearch] = useState("");

  const detailOrder = orders.find((o) => o.id === detail);
  if (detailOrder) return <div className="content-inner"><OrderDetail order={detailOrder} isAdmin={isAdmin} onBack={() => setDetail(null)} onUpdate={(o) => { setOrders(orders.map((x) => x.id === o.id ? o : x)); setDetail(null); }} /></div>;

  const active = orders.filter((o) => o.status !== "Entregada");
  const hist = orders.filter((o) => o.status === "Entregada");
  const shown = (tab === "activas" ? active : hist).filter((o) => !search || o.client.toLowerCase().includes(search.toLowerCase()) || o.id.toLowerCase().includes(search.toLowerCase()));

  return <div className="screen-stack">
    <div className="hero-row"><div><div className="section-title">Órdenes de taller</div><div className="muted">Registra y da seguimiento a los servicios de motocicletas.</div></div><Button icon="plus" onClick={() => setNewModal(true)}>Nuevo servicio</Button></div>
    <div className="mini-kpis">
      <Card><span>Recibidas</span><strong style={{ color: "var(--color-text)" }}>1</strong></Card>
      <Card><span>En reparación</span><strong style={{ color: "var(--color-warning)" }}>2</strong></Card>
      <Card><span>Listas para entregar</span><strong style={{ color: "var(--color-success)" }}>1</strong></Card>
      <Card><span>Entregadas hoy</span><strong style={{ color: "var(--color-blue)" }}>1</strong></Card>
    </div>
    <Card>
      <div className="workshop-header">
        <div className="workshop-tabs">
          <button type="button" className={`workshop-tab ${tab === "activas" ? "active" : ""}`} onClick={() => setTab("activas")}>Órdenes activas <span className="tab-count">{active.length}</span></button>
          <button type="button" className={`workshop-tab ${tab === "historial" ? "active" : ""}`} onClick={() => setTab("historial")}>Historial <span className="tab-count">{hist.length}</span></button>
        </div>
        <TextInput placeholder="Buscar por cliente u orden..." icon="search" value={search} onChange={setSearch} />
      </div>
      <div className="table-wrap">
        <table><thead><tr><th>Orden</th><th>Cliente</th><th>Teléfono</th><th>Moto / placa</th><th>Trabajo</th><th>Mecánico</th><th>Estado</th><th>Costo</th><th>Acciones</th></tr></thead>
        <tbody>{shown.map((r) => <tr key={r.id} style={{ cursor: "pointer" }} onClick={() => setDetail(r.id)}>
          <td><strong>{r.id}</strong></td>
          <td>{r.client}</td>
          <td>{r.phone}</td>
          <td>{r.moto}</td>
          <td>{r.work}</td>
          <td>{r.mechanic}</td>
          <td onClick={(e) => e.stopPropagation()}><Badge tone={WSTATUS_TONE[r.status]}>{r.status}</Badge></td>
          <td><strong>{fmtQ(r.cost)}</strong> <span className="cost-type">({r.costType})</span></td>
          <td onClick={(e) => e.stopPropagation()}>
            <div className="row-actions">
              {isAdmin && <><IconButton icon="edit" label="Editar" /><IconButton icon="trash" label="Eliminar" /></>}
            </div>
          </td>
        </tr>)}</tbody>
        </table>
      </div>
    </Card>

    <Modal open={newModal} title="Registrar servicio de taller" onClose={() => setNewModal(false)} onConfirm={() => setNewModal(false)} confirmLabel="Guardar servicio">
      <div className="form-grid two">
        <TextInput label="Cliente" placeholder="Nombre completo" />
        <TextInput label="Teléfono" placeholder="Ej. 5512-3344" />
        <div className="span-two"><TextInput label="Motocicleta / placa" placeholder="Ej. Honda CB190R · P-482JDM" /></div>
        <div className="span-two"><TextArea label="Descripción del trabajo" placeholder="Describe el servicio requerido" /></div>
        <Select label="Mecánico" options={ACTIVE_MECHS} />
        <TextInput label="Costo estimado" placeholder="Q 0.00" />
      </div>
    </Modal>
  </div>;
}

// ─── commissions ─────────────────────────────────────────────────────────────

type CommRow = { id: number; date: string; product: string; cat: string; payment: string; amount: number; commPct: string; commAmt: string };

const COMM_ROWS: CommRow[] = [
  { id: 1, date: "14/09", product: "Casco LS2 Stream Evo", cat: "Accesorio", payment: "Tarjeta", amount: 1250, commPct: "2.5%", commAmt: "Q 31.25" },
  { id: 2, date: "14/09", product: "Guantes Alpinestars + Jersey Fox (2 art.)", cat: "Accesorio", payment: "Efectivo", amount: 1075, commPct: "2.5%", commAmt: "Q 26.88" },
  { id: 3, date: "10/09", product: "Yamaha MT-03", cat: "Moto nueva", payment: "Transferencia", amount: 52500, commPct: "Pendiente", commAmt: "" },
  { id: 4, date: "05/09", product: "Kit de mantenimiento", cat: "Repuesto", payment: "Efectivo", amount: 1850, commPct: "2.5%", commAmt: "Q 46.25" },
  { id: 5, date: "02/09", product: "Honda CRF150L", cat: "Moto nueva", payment: "Efectivo", amount: 55775, commPct: "4.0%", commAmt: "Q 2,231.00" },
];

function Commissions() {
  const [rows, setRows] = useState<CommRow[]>(COMM_ROWS);
  const [assignTarget, setAssignTarget] = useState<CommRow | null>(null);
  const [seller, setSeller] = useState("María López");
  // RF 3.3: comisiones por vendedor en un rango de fechas libre
  const [range, setRange] = useState<DateRange>(() => presetRange("Este mes"));

  const handleAssign = (pct: string) => {
    if (!assignTarget) return;
    const calc = assignTarget.amount * parseFloat(pct) / 100;
    setRows(rows.map((r) => r.id === assignTarget.id ? { ...r, commPct: pct + "%", commAmt: fmtQ(calc) } : r));
    setAssignTarget(null);
  };

  return <div className="screen-stack">
    <div className="hero-row">
      <div><div className="section-title">Comisiones por vendedor</div><div className="muted">Consulta el rendimiento y las comisiones generadas.</div></div>
      <div className="inline-filters"><Select value={seller} options={ACTIVE_SELLERS} onChange={setSeller} /><DateRangePicker value={range} onChange={setRange} align="right" /></div>
    </div>
    <div className="comm-kpis">
      <Card><span>Total vendido</span><strong>Q 112,450.00</strong><small>12 ventas</small></Card>
      <Card><span>Comisión asignada</span><strong>Q 4,218.75</strong><small>Promedio 3.75%</small></Card>
      <Card><span>Ticket promedio</span><strong>Q 9,370.83</strong><small>+6.4% este mes</small></Card>
      <Card className="comm-pending-kpi"><span>Comisiones pendientes</span><strong>1</strong><small>Por asignar</small></Card>
    </div>
    <Card>
      <div className="card-heading"><div><div className="card-title">Detalle de ventas — {seller}</div><div className="muted small">{fmtRangeLong(range)}</div></div><Button variant="secondary" icon="download">Exportar</Button></div>
      <div className="table-wrap"><table>
        <thead><tr><th>Fecha</th><th>Producto</th><th>Categoría</th><th>Pago</th><th>Monto</th><th>Comisión %</th><th>Comisión Q</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.id}>
          <td>{r.date}</td>
          <td><strong>{r.product}</strong></td>
          <td>{r.cat}</td>
          <td>{r.payment}</td>
          <td><strong>{fmtQ(r.amount)}</strong></td>
          <td>{r.commPct === "Pendiente" ? <button type="button" className="assign-chip" onClick={() => setAssignTarget(r)}>Asignar</button> : r.commPct}</td>
          <td>{r.commAmt || <span className="muted">—</span>}</td>
        </tr>)}</tbody>
      </table></div>
    </Card>
    {assignTarget && <AssignModal open={true} saleProduct={assignTarget.product} saleAmount={assignTarget.amount} onClose={() => setAssignTarget(null)} onConfirm={handleAssign} />}
  </div>;
}

// ─── stats ───────────────────────────────────────────────────────────────────

const STATS_TABS = ["Ventas", "Vendedores", "Categorías", "Ventas vs. gastos", "Taller"];

const VG_DATA = [
  { m: "Abr", v: 198, g: 42 }, { m: "May", v: 224, g: 50 }, { m: "Jun", v: 251, g: 55 },
  { m: "Jul", v: 265, g: 58 }, { m: "Ago", v: 263, g: 62 }, { m: "Sep*", v: 284, g: 48 },
];

function Stats() {
  const [tab, setTab] = useState("Ventas");
  const [periodo, setPeriodo] = useState<Granularity | "Personalizado">("Mensual");
  // RF 4.1/4.2: se elige la granularidad y luego se navega libremente entre períodos o se usa un rango propio
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [customRange, setCustomRange] = useState<DateRange>(() => presetRange("Últimos 30 días"));
  const [pago, setPago] = useState("Todos");
  const [vendedor, setVendedor] = useState("Todos");
  const [categoria, setCategoria] = useState("Todas");
  const [comparar, setComparar] = useState(true);
  const maxVG = Math.max(...VG_DATA.map(d => d.v));

  const today = startOfDay(new Date());
  const isCustom = periodo === "Personalizado";
  const range = isCustom ? customRange : periodRange(periodo, anchor);
  const label = isCustom ? fmtRange(customRange) : periodLabel(periodo, anchor);
  const prevLabel = isCustom || periodo === "Diario" ? fmtRange(previousRange(range)) : periodLabel(periodo, shiftPeriod(periodo, anchor, -1));
  const seriesUnit = periodo === "Diario" ? "ventas por hora" : periodo === "Anual" ? "ventas mensuales" : "ventas diarias";
  const rangeDays = Math.round((range.end.getTime() - range.start.getTime()) / 86_400_000);
  const axisLabels = periodo === "Diario" ? ["8:00", "10:00", "12:00", "14:00", "16:00", "18:00"]
    : periodo === "Anual" ? [0, 2, 4, 6, 8, 10].map((m) => fmtMonthShort(new Date(range.start.getFullYear(), m, 1)))
    : [0, 1, 2, 3, 4].map((i) => fmtDayMonth(addDays(range.start, Math.round(i * rangeDays / 4))));
  // Tendencia de 6 meses que termina en el mes del período elegido
  const trendMonths = VG_DATA.map((_, i) => addMonths(startOfMonth(range.end), i - (VG_DATA.length - 1)));
  const currentMonth = startOfMonth(today);
  const trendIncludesCurrent = trendMonths.some((m) => m.getTime() === currentMonth.getTime());
  const trendTitle = trendMonths[0].getFullYear() === trendMonths[5].getFullYear()
    ? `${fmtMonth(trendMonths[0]).split(" ")[0]} – ${fmtMonth(trendMonths[5])}`
    : `${fmtMonth(trendMonths[0])} – ${fmtMonth(trendMonths[5])}`;

  return <div className="screen-stack">
    <Card className="report-filters">
      <div>
        <div className="field-label">Período</div>
        <Segmented options={["Diario", "Semanal", "Mensual", "Anual", "Personalizado"]} value={periodo} onChange={(v) => setPeriodo(v as Granularity | "Personalizado")} />
        {isCustom
          ? <div className="period-range-row"><DateRangePicker value={customRange} onChange={setCustomRange} /></div>
          : <PeriodStepper label={label} onPrev={() => setAnchor(shiftPeriod(periodo, anchor, -1))} onNext={() => setAnchor(shiftPeriod(periodo, anchor, 1))} nextDisabled={periodRange(periodo, shiftPeriod(periodo, anchor, 1)).start > today} onReset={() => setAnchor(today)} resetDisabled={range.start <= today && today <= range.end} />}
      </div>
      <Select label="Pago" value={pago} options={["Todos","Efectivo","Transferencia","Tarjeta"]} onChange={setPago} />
      <Select label="Vendedor" value={vendedor} options={["Todos","María López","Carlos Pérez","José Méndez"]} onChange={setVendedor} />
      <Select label="Categoría" value={categoria} options={["Todas","Moto nueva","Moto usada","Accesorio","Repuesto","Otro"]} onChange={setCategoria} />
      <Toggle checked={comparar} onChange={setComparar} label={`Comparar con ${prevLabel}`} />
    </Card>

    <div className="stats-tabs">
      {STATS_TABS.map(t => <button key={t} type="button" className={`stats-tab${tab === t ? " active" : ""}`} onClick={() => setTab(t)}>{t}</button>)}
    </div>

    {tab === "Ventas" && <div className="screen-stack">
      <div className="kpi-grid">
        <KpiCard icon="cash" label="Total vendido" value="Q 284,650.00" foot="+8.2% vs. período anterior" tone="orange" />
        <KpiCard icon="trending" label="Ticket promedio" value="Q 9,182.26" foot="+3.4% vs. período anterior" tone="blue" />
        <KpiCard icon="history" label="Transacciones" value="31" foot="+5 vs. período anterior" tone="purple" />
        <KpiCard icon="file" label="Facturas emitidas" value="148" foot="74% del límite" tone="green" />
      </div>
      <Card className="chart-card wide">
        <div className="card-heading">
          <div><div className="card-title">Ventas en el tiempo</div><div className="muted small">{label} · {seriesUnit}</div></div>
          {comparar && <div className="legend"><span><i className="dot orange" /> {label}</span><span><i className="dot gray" /> {prevLabel}</span></div>}
        </div>
        <div className="line-chart tall">
          <div className="grid-lines"><span/><span/><span/><span/></div>
          <svg viewBox="0 0 800 210" preserveAspectRatio="none">
            <path className="area-path" d="M0 180 C80 155 120 170 190 130 S300 110 380 120 S500 60 590 80 S710 35 800 45 L800 210 L0 210Z"/>
            <path className="sales-path" d="M0 180 C80 155 120 170 190 130 S300 110 380 120 S500 60 590 80 S710 35 800 45"/>
            {comparar && <path className="expense-path" d="M0 190 C80 175 120 168 190 155 S300 130 380 140 S500 110 590 120 S710 85 800 95"/>}
          </svg>
          <div className="x-labels">{axisLabels.map((l) => <span key={l}>{l}</span>)}</div>
        </div>
      </Card>
    </div>}

    {tab === "Vendedores" && <Card className="chart-card wide">
      <div className="card-heading"><div><div className="card-title">Ventas por vendedor</div><div className="muted small">{label} · monto vendido</div></div></div>
      <div className="bar-chart">
        <div className="y-axis"><span>Q 120k</span><span>Q 80k</span><span>Q 40k</span><span>Q 0</span></div>
        <div className="bars">
          <div className="bar-group"><span className="bar bar-one" /><strong>Q 112,450</strong><small>María López · 12 ventas</small></div>
          <div className="bar-group"><span className="bar bar-two" /><strong>Q 98,700</strong><small>Carlos Pérez · 10 ventas</small></div>
          <div className="bar-group"><span className="bar bar-three" /><strong>Q 73,500</strong><small>José Méndez · 9 ventas</small></div>
        </div>
      </div>
      <div className="chart-summary"><span>31 ventas en total</span><span>Ticket promedio <strong>Q 9,182.26</strong></span></div>
    </Card>}

    {tab === "Categorías" && <Card className="chart-card wide">
      <div className="card-heading"><div><div className="card-title">Ventas por categoría</div><div className="muted small">{label}</div></div></div>
      <div className="donut-layout">
        <div className="donut"><div><strong>Q 284k</strong><span>Total</span></div></div>
        <div className="donut-legend">
          <span><i className="dot orange" /> Motos nuevas <strong>Q 136,632 · 48%</strong></span>
          <span><i className="dot blue" /> Motos usadas <strong>Q 74,009 · 26%</strong></span>
          <span><i className="dot purple" /> Accesorios <strong>Q 51,237 · 18%</strong></span>
          <span><i className="dot gray" /> Otros <strong>Q 22,772 · 8%</strong></span>
        </div>
      </div>
    </Card>}

    {tab === "Ventas vs. gastos" && <Card className="chart-card wide">
      <div className="card-heading">
        <div><div className="card-title">Ventas vs. gastos</div><div className="muted small">{trendTitle}</div></div>
        <div className="legend"><span><i className="dot orange" /> Ventas</span><span><i className="dot gray" /> Gastos</span></div>
      </div>
      <div className="vg-bars">
        {VG_DATA.map((d, i) => <div className="vg-col" key={d.m}>
          <div className="vg-bar-pair">
            <div className="vg-bar orange" style={{ height: `${(d.v / maxVG) * 100}%` }}><span className="vg-val">Q {d.v}k</span></div>
            <div className="vg-bar gray" style={{ height: `${(d.g / maxVG) * 100}%` }}><span className="vg-val">Q {d.g}k</span></div>
          </div>
          <span className="vg-month">{fmtMonthShort(trendMonths[i])}{trendMonths[i].getTime() === currentMonth.getTime() ? "*" : ""}</span>
        </div>)}
      </div>
      {trendIncludesCurrent && <div className="muted small" style={{ textAlign: "right", marginTop: "0.5rem" }}>* {fmtMonth(today).split(" ")[0]} parcial al {fmtDayMonth(today)}</div>}
    </Card>}

    {tab === "Taller" && <div className="screen-stack">
      <div className="kpi-grid">
        <KpiCard icon="wrench" label="Órdenes activas" value="4" foot="2 listas para entregar" tone="orange" />
        <KpiCard icon="cash" label="Ingresos taller (mes)" value="Q 14,200.00" foot="3 órdenes cobradas" tone="blue" />
        <KpiCard icon="trending" label="Órdenes completadas" value="8" foot={label} tone="purple" />
      </div>
      <Card>
        <div className="card-title">Órdenes por mecánico</div>
        <div className="bar-chart">
          <div className="y-axis"><span>5</span><span>4</span><span>3</span><span>2</span><span>1</span><span>0</span></div>
          <div className="bars">
            <div className="bar-group"><span className="bar bar-one" style={{ height: "80%" }} /><strong>4</strong><small>M. Hernández</small></div>
            <div className="bar-group"><span className="bar bar-two" style={{ height: "60%" }} /><strong>3</strong><small>P. Ajú</small></div>
            <div className="bar-group"><span className="bar bar-three" style={{ height: "40%" }} /><strong>2</strong><small>J. Tzul</small></div>
            <div className="bar-group"><span className="bar" style={{ height: "20%", background: "var(--color-muted)" }} /><strong>1</strong><small>É. Chávez</small></div>
          </div>
        </div>
      </Card>
    </div>}
  </div>;
}

// ─── expenses ────────────────────────────────────────────────────────────────

function Expenses() {
  // Un gasto puede ser de días anteriores (factura que llegó tarde), pero nunca futuro
  const [expenseDate, setExpenseDate] = useState(() => startOfDay(new Date()));
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  return <div className="split-layout">
    <Card className="form-card">
      <div className="card-title">Registrar compra o gasto</div>
      <div className="muted small">Agrega una compra o gasto operativo.</div>
      <div className="vertical-form">
        <DatePicker label="Fecha" value={expenseDate} onChange={setExpenseDate} max={new Date()} />
        <TextInput label="Monto" placeholder="Q 0.00" />
        <Select label="Categoría" options={["Servicios", "Repuestos", "Renta", "Planilla", "Otros"]} />
        <TextArea label="Descripción" placeholder="Detalle del gasto" />
        <Button icon="plus">Guardar gasto</Button>
      </div>
    </Card>
    <Card>
      <div className="card-heading">
        <div><div className="card-title">Gastos registrados</div><div className="muted small">Total de {fmtMonth(month).split(" ")[0].toLowerCase()}: Q 48,320.00</div></div>
        <MonthPicker value={month} onChange={setMonth} />
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Fecha</th><th>Descripción</th><th>Categoría</th><th>Monto</th><th>Acciones</th></tr></thead>
          <tbody>
            {[
              ["12 Sep", "Compra de aceite y lubricantes", "Repuestos", "Q 3,450.00"],
              ["10 Sep", "Energía eléctrica", "Servicios", "Q 1,250.00"],
              ["05 Sep", "Renta del local", "Renta", "Q 6,500.00"],
            ].map(r => <tr key={r[1]}>
              <td>{r[0]}</td>
              <td><strong>{r[1]}</strong></td>
              <td><Badge>{r[2]}</Badge></td>
              <td><strong>{r[3]}</strong></td>
              <td><div className="row-actions"><IconButton icon="edit" label="Editar" /><IconButton icon="trash" label="Eliminar" /></div></td>
            </tr>)}
          </tbody>
        </table>
      </div>
      <div className="table-footer-note">Mostrando 3 de 8 gastos</div>
    </Card>
  </div>;
}

// ─── personal ────────────────────────────────────────────────────────────────

type Person = { id: number; name: string; initials: string; type: "Vendedor" | "Mecánico"; info: string; active: boolean };

const INIT_PERSONS: Person[] = [
  { id: 1, name: "María López", initials: "ML", type: "Vendedor", info: "12 ventas este mes", active: true },
  { id: 2, name: "Carlos Pérez", initials: "CP", type: "Vendedor", info: "10 ventas este mes", active: true },
  { id: 3, name: "José Méndez", initials: "JM", type: "Vendedor", info: "9 ventas este mes", active: true },
  { id: 4, name: "Ana Castillo", initials: "AC", type: "Vendedor", info: "Sin actividad", active: false },
  { id: 5, name: "Mario Hernández", initials: "MH", type: "Mecánico", info: "2 órdenes activas", active: true },
  { id: 6, name: "Pedro Ajú", initials: "PA", type: "Mecánico", info: "1 orden activa", active: true },
  { id: 7, name: "Julio Tzul", initials: "JT", type: "Mecánico", info: "1 orden activa", active: true },
  { id: 8, name: "Érick Chávez", initials: "EC", type: "Mecánico", info: "Sin actividad", active: true },
];

function Sellers() {
  const [persons, setPersons] = useState<Person[]>(INIT_PERSONS);
  const [typeFilter, setTypeFilter] = useState("Todos");
  const [statusFilter, setStatusFilter] = useState("Activos");
  const [addModal, setAddModal] = useState(false);

  const toggle = (id: number) => setPersons(persons.map((p) => p.id === id ? { ...p, active: !p.active } : p));

  const shown = persons.filter((p) => {
    const okType = typeFilter === "Todos" || p.type + "s" === typeFilter;
    const okStatus = statusFilter === "Todos" || (statusFilter === "Activos" ? p.active : !p.active);
    return okType && okStatus;
  });

  return <div className="screen-stack">
    <div className="hero-row">
      <div><div className="section-title">Personal</div><div className="muted">Administra las personas asignadas a ventas y órdenes de taller.</div></div>
      <Button icon="plus" onClick={() => setAddModal(true)}>Agregar persona</Button>
    </div>
    <div className="info-banner"><Icon name="users" /><div><strong>Sin cuentas de acceso</strong><span>El personal no tiene cuentas de acceso al sistema. Los vendedores se asignan a ventas y los mecánicos a órdenes de taller.</span></div></div>
    <div className="personal-filters">
      <Segmented options={["Todos", "Vendedores", "Mecánicos"]} value={typeFilter} onChange={setTypeFilter} />
      <Segmented options={["Activos", "Inactivos", "Todos"]} value={statusFilter} onChange={setStatusFilter} />
    </div>
    <div className="seller-grid">
      {shown.map((p) => <Card className="seller-card" key={p.id}>
        <div className={`seller-avatar ${p.type === "Mecánico" ? "mech" : ""}`}>{p.initials}</div>
        <div className="seller-info">
          <strong>{p.name}</strong>
          <span>{p.info}</span>
          <Badge tone={p.type === "Vendedor" ? "info" : "neutral"}>{p.type}</Badge>
        </div>
        <div className="seller-right">
          <button type="button" className={`person-toggle ${p.active ? "on" : ""}`} onClick={() => toggle(p.id)} title={p.active ? "Activo — click para desactivar" : "Inactivo — click para activar"}>
            <span /><span className="toggle-label">{p.active ? "Activo" : "Inactivo"}</span>
          </button>
          <IconButton icon="edit" label="Editar" />
        </div>
      </Card>)}
    </div>

    <Modal open={addModal} title="Agregar persona" onClose={() => setAddModal(false)} onConfirm={() => setAddModal(false)} confirmLabel="Agregar">
      <div className="vertical-form" style={{ marginTop: 0 }}>
        <TextInput label="Nombre completo" placeholder="Ej. Luisa Ajú" />
        <div className="field">
          <span className="field-label">Tipo</span>
          <div className="segmented"><UnstyledButton className="selected"><span>Vendedor</span></UnstyledButton><UnstyledButton className=""><span>Mecánico</span></UnstyledButton></div>
        </div>
        <TextInput label="Teléfono (opcional)" placeholder="Ej. 5512-3344" />
      </div>
    </Modal>
  </div>;
}

// ─── closing ─────────────────────────────────────────────────────────────────

const LAST_CLOSING_DATE = new Date(2026, 7, 31);

function Closing({ onHistory }: { onHistory: () => void }) {
  const [modal, setModal] = useState(false);
  const [understood, setUnderstood] = useState(false);
  // Los cierres son consecutivos: el período abierto empieza el día siguiente al último cierre
  // (31/08/2026) y el administrador solo elige hasta qué día cierra (máximo hoy).
  const periodStart = addDays(LAST_CLOSING_DATE, 1);
  const [periodEnd, setPeriodEnd] = useState(() => startOfDay(new Date()));
  const period = { start: periodStart, end: periodEnd };

  return <div className="screen-stack">
    <Card className="closing-hero">
      <div><Badge tone="warning">Período abierto</Badge><div className="section-title">Cierre del {fmtRangeLong(period)}</div><div className="muted">Verifica que todos los movimientos estén registrados antes de cerrar.</div></div>
      <div className="closing-range">
        <div className="field"><span className="field-label">Desde</span><div className="readonly-from" title="Día siguiente al último cierre"><Icon name="lock" size="sm" />{fmtLongDay(periodStart)}</div></div>
        <DatePicker label="Hasta" value={periodEnd} onChange={setPeriodEnd} min={periodStart} max={new Date()} align="right" />
      </div>
    </Card>

    <div className="payment-totals">
      <Card><Icon name="cash" /><span>Efectivo</span><strong>Q 96,450.00</strong><small>12 ventas</small></Card>
      <Card><Icon name="bank" /><span>Transferencia</span><strong>Q 128,700.00</strong><small>11 ventas</small></Card>
      <Card><Icon name="card" /><span>Tarjeta</span><strong>Q 59,500.00</strong><small>8 ventas</small></Card>
      <Card className="total-card"><Icon name="trending" /><span>Total general</span><strong>Q 284,650.00</strong><small>31 ventas</small></Card>
    </div>

    <div className="comm-pending-banner">
      <Icon name="coins" size="sm" />
      <span>Hay <strong>3 ventas</strong> con comisión pendiente en este período. Asígnalas antes de cerrar.</span>
      <button type="button" className="forgot-link" onClick={onHistory}>Ver ventas</button>
    </div>

    <div className="close-action">
      <div><strong>¿Todo está correcto?</strong><span>Después del cierre no podrás modificar las ventas de este período.</span></div>
      <Button icon="lock" onClick={() => setModal(true)}>Cerrar período</Button>
    </div>

    <Card>
      <div className="card-title">Cierres anteriores</div>
      <div className="table-wrap"><table>
        <thead><tr><th>Periodo</th><th>Fecha de cierre</th><th>Ventas</th><th>Total</th><th>Responsable</th><th>Estado</th></tr></thead>
        <tbody>
          <tr><td>Agosto 2026</td><td>31/08/2026 · 18:05</td><td>69</td><td><strong>Q 542,800.00</strong></td><td>Administrador</td><td><Badge tone="success">Cerrado</Badge></td></tr>
          <tr><td>Julio 2026</td><td>31/07/2026 · 17:42</td><td>71</td><td><strong>Q 588,400.00</strong></td><td>Administrador</td><td><Badge tone="success">Cerrado</Badge></td></tr>
        </tbody>
      </table></div>
    </Card>

    <Modal
      open={modal}
      title={`¿Cerrar el período del ${fmtRangeLong(period)}?`}
      onClose={() => { setModal(false); setUnderstood(false); }}
      onConfirm={() => { setModal(false); setUnderstood(false); }}
      confirmLabel="Confirmar cierre"
      confirmDisabled={!understood}
    >
      <div className="warning-box"><Icon name="lock" /><span>Esta acción no se puede deshacer. Después del cierre no se podrán agregar, editar ni eliminar ventas de este período.</span></div>
      <div className="confirm-box">
        <div><span>Periodo</span><strong>{fmtRange(period)}</strong></div>
        <div><span>Total</span><strong>Q 284,650.00</strong></div>
        <div><span>Ventas</span><strong>31</strong></div>
      </div>
      <label className="understood-check"><input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} /><span>Entiendo que esta acción es definitiva</span></label>
    </Modal>
  </div>;
}

// ─── settings ────────────────────────────────────────────────────────────────

function Settings({ dark, onSetDark, accent, onSetAccent }: { dark: boolean; onSetDark: (d: boolean) => void; accent: Accent; onSetAccent: (a: Accent) => void }) {
  const COMM_CATS = [
    { label: "Accesorio", key: "Accesorio", default: "2.5" },
    { label: "Repuesto", key: "Repuesto", default: "2.5" },
    { label: "Moto nueva", key: "Moto nueva", default: "" },
    { label: "Moto usada", key: "Moto usada", default: "" },
    { label: "Otro", key: "Otro", default: "" },
  ];
  const [comms, setComms] = useState<Record<string, string>>(Object.fromEntries(COMM_CATS.map(c => [c.key, c.default])));

  return <div className="settings-layout">
    <div className="screen-stack">
      <Card className="form-card">
        <div className="card-heading">
          <div><div className="card-title">Comisiones por categoría</div><div className="muted small">Porcentaje sugerido por categoría (opcional). Se aplica al registrar una venta.</div></div>
          <Icon name="coins" />
        </div>
        <div className="settings-rows">
          {COMM_CATS.map(c => <div key={c.key}>
            <strong>{c.label}</strong>
            <TextInput value={comms[c.key]} placeholder="Sin definir" onChange={v => setComms({ ...comms, [c.key]: v })} />
          </div>)}
        </div>
      </Card>

      <Card className="form-card">
        <div className="card-title">Control de facturación</div>
        <TextInput label="Límite mensual de facturas" value="200" />
        <div className="notice"><Icon name="file" size="sm" /><span>Incluye facturas de ventas y de taller. Recibirás una alerta al alcanzar el 80% del límite.</span></div>
      </Card>

      <Card className="form-card">
        <div className="card-title">Seguridad</div>
        <div className="muted small" style={{ marginBottom: "1.25rem" }}>Cambio de contraseñas de acceso al sistema.</div>
        <div className="security-grid">
          <div>
            <div className="field-label" style={{ marginBottom: "0.75rem" }}>Contraseña del Administrador</div>
            <div className="vertical-form" style={{ marginTop: 0, gap: "0.75rem" }}>
              <TextInput type="password" label="Contraseña actual" placeholder="••••••••" />
              <TextInput type="password" label="Nueva contraseña" placeholder="••••••••" />
              <TextInput type="password" label="Confirmar nueva contraseña" placeholder="••••••••" />
              <Button variant="secondary">Actualizar contraseña</Button>
            </div>
          </div>
          <div>
            <div className="field-label" style={{ marginBottom: "0.75rem" }}>Contraseña del Empleado</div>
            <div className="vertical-form" style={{ marginTop: 0, gap: "0.75rem" }}>
              <TextInput type="password" label="Nueva contraseña" placeholder="••••••••" />
              <TextInput type="password" label="Confirmar nueva contraseña" placeholder="••••••••" />
              <Button variant="secondary">Actualizar contraseña</Button>
            </div>
          </div>
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
        <div className="muted small" style={{ marginBottom: "0.9rem" }}>Se aplica a botones, menú, gráficas y al inicio de sesión, tanto en tema claro como oscuro.</div>
        <div className="accent-selector">
          {ACCENTS.map(a => <button type="button" key={a.id} className={`accent-option${accent === a.id ? " active" : ""}`} onClick={() => onSetAccent(a.id)}>
            <span className="accent-swatch" style={{ background: a.swatch }}>{accent === a.id && <Icon name="check" size="sm" />}</span>
            <span><span>{a.label}</span><small>{a.note}</small></span>
          </button>)}
        </div>
      </Card>
    </div>

    <Card className="form-card">
      <div className="card-title">Datos de la empresa</div>
      <div className="logo-uploader">
        <img className="brand-logo" src={logo} alt="SoloMotos" />
        <div><strong>Logo de la empresa</strong><span>PNG o JPG, máximo 2 MB</span><Button variant="secondary">Cambiar logo</Button></div>
      </div>
      <div className="vertical-form">
        <TextInput label="Nombre comercial" value="SoloMotos Quetzaltenango" />
        <TextInput label="NIT" value="8214573-6" />
        <TextArea label="Dirección" value="7a. calle 4-63, zona 2, Quetzaltenango" />
        <TextInput label="Teléfono" value="+502 7765 4321" />
        <Button icon="check">Guardar configuración</Button>
      </div>
    </Card>
  </div>;
}

// ─── invoice (legacy screen, kept for nav) ───────────────────────────────────

function Invoice({ onBack }: { onBack: () => void }) {
  return <div className="invoice-page"><div className="invoice-actions"><Button variant="secondary" onClick={onBack}>Volver</Button><div><Button variant="secondary" icon="download">Descargar PDF</Button><Button icon="print">Imprimir</Button></div></div><div className="invoice-sheet"><div className="invoice-head"><div className="invoice-brand"><img className="brand-logo" src={logo} alt="SoloMotos" /><span>Pasión que te mueve</span></div><div className="invoice-meta"><Badge tone="success">FACTURA FEL</Badge><strong>No. SM-00148</strong><span>Fecha: 14/09/2026 · 11:48</span></div></div><div className="invoice-company"><div><strong>SoloMotos Quetzaltenango</strong><span>NIT: 8214573-6</span><span>7a. calle 4-63, zona 2, Quetzaltenango</span><span>Tel. +502 7765 4321</span></div></div><div className="client-box"><div><span>Cliente</span><strong>Daniel Fuentes Castillo</strong></div><div><span>NIT</span><strong>5489632-1</strong></div><div><span>Dirección fiscal</span><strong>5a. calle 12-40, zona 3, Quetzaltenango</strong></div></div><div className="invoice-table"><div className="invoice-tr invoice-th"><span>Cant.</span><span>Descripción</span><span>Precio unitario</span><span>Total</span></div><div className="invoice-tr"><span>1</span><span><strong>Casco LS2 Stream Evo</strong><small>Color negro mate · Talla M</small></span><span>Q 1,250.00</span><span><strong>Q 1,250.00</strong></span></div></div><div className="invoice-total"><div><span>Método de pago</span><strong>Tarjeta</strong></div><div><span>Total</span><strong>Q 1,250.00</strong></div></div><div className="invoice-footer"><span>Gracias por preferir SoloMotos.</span><span>Documento tributario electrónico autorizado por la SAT.</span></div></div></div>;
}

// ─── login ───────────────────────────────────────────────────────────────────

function Login({ onLogin }: { onLogin: (role: Role) => void }) {
  const [selectedRole, setSelectedRole] = useState<Role>("Administrador");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState(false);

  const PASSWORDS: Record<Role, string> = { "Administrador": "admin123", "Empleado": "empleado123" };

  const handleLogin = () => {
    if (password === PASSWORDS[selectedRole]) {
      setError(false);
      onLogin(selectedRole);
    } else {
      setError(true);
    }
  };

  return <main className="login-page">
    <div className="login-art">
      <div className="login-brand"><img className="brand-logo" src={logo} alt="SoloMotos" /><span>Sistema de Ventas</span></div>
      <div className="login-message"><div className="login-line"/><div>Control simple.<br/>Decisiones más rápidas.</div><span>Ventas, taller y facturación en un solo lugar.</span></div>
      <div className="login-city">Quetzaltenango, Guatemala</div>
    </div>
    <div className="login-panel">
      <Card className="login-card">
        <div className="login-title">Bienvenido</div>
        <div className="muted">Selecciona tu perfil e ingresa tu contraseña.</div>
        <div className="vertical-form">
          <div className="field">
            <span className="field-label">Perfil de acceso</span>
            <div className="login-role-seg">
              <UnstyledButton className={selectedRole === "Administrador" ? "login-role-btn selected" : "login-role-btn"} onClick={() => { setSelectedRole("Administrador"); setError(false); }}>
                <Icon name="settings" size="sm" /><span>Administrador</span>
              </UnstyledButton>
              <UnstyledButton className={selectedRole === "Empleado" ? "login-role-btn selected" : "login-role-btn"} onClick={() => { setSelectedRole("Empleado"); setError(false); }}>
                <Icon name="users" size="sm" /><span>Empleado</span>
              </UnstyledButton>
            </div>
          </div>
          <div className="field">
            <span className="field-label">Contraseña</span>
            <span className={`input-shell${error ? " has-error" : ""}`}>
              <Icon name="lock" size="sm" />
              <input type={showPw ? "text" : "password"} value={password} placeholder="••••••••" onChange={(e) => { setPassword(e.target.value); setError(false); }} onKeyDown={(e) => e.key === "Enter" && handleLogin()} />
              <button type="button" className="eye-btn" onClick={() => setShowPw(!showPw)} aria-label={showPw ? "Ocultar contraseña" : "Mostrar contraseña"}><Icon name="eye" size="sm" /></button>
            </span>
            {error && <span className="field-error">Contraseña incorrecta. Intenta de nuevo.</span>}
            <div className="forgot-pw"><button type="button" className="forgot-link">¿Olvidaste tu contraseña?</button></div>
          </div>
          <Button onClick={handleLogin}>Ingresar</Button>
          <div className="login-demo-hint">Demo: admin123 / empleado123</div>
        </div>
      </Card>
    </div>
  </main>;
}

// ─── app root ────────────────────────────────────────────────────────────────

export default function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [role, setRole] = useState<Role>("Administrador");
  const [screen, setScreen] = useState<Screen>("dashboard");
  const [dark, setDark] = useState(false);
  const [accent, setAccent] = useState<Accent>("orange");
  // Se aplica en <html> para que el color también llegue a la pantalla de login
  useEffect(() => { document.documentElement.dataset.accent = accent; }, [accent]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const allowedScreen = useMemo(() => role === "Empleado" && !["home", "sale", "history", "workshop", "invoice"].includes(screen) ? "home" : screen, [role, screen]);

  const handleLogin = (r: Role) => {
    setRole(r);
    setScreen(r === "Administrador" ? "dashboard" : "home");
    setLoggedIn(true);
  };

  const handleLogout = () => { setLoggedIn(false); setScreen("dashboard"); };

  if (!loggedIn) return <Login onLogin={handleLogin} />;

  const content: Record<Screen, ReactNode> = {
    home: <EmployeeHome onNewSale={() => setScreen("sale")} onInvoice={() => setScreen("invoice")} onViewOrder={(id) => { setSelectedOrderId(id); setScreen("workshop"); }} />,
    dashboard: <Dashboard onNewSale={() => setScreen("sale")} />,
    sale: <NewSale role={role} onHistory={() => setScreen("history")} />,
    history: <History role={role} onInvoice={() => setScreen("invoice")} />,
    workshop: <Workshop role={role} initialOrderId={selectedOrderId} />,
    commissions: <Commissions />,
    stats: <Stats />,
    expenses: <Expenses />,
    sellers: <Sellers />,
    closing: <Closing onHistory={() => setScreen("history")} />,
    settings: <Settings dark={dark} onSetDark={setDark} accent={accent} onSetAccent={setAccent} />,
    invoice: <Invoice onBack={() => setScreen("sale")} />,
  };
  return <div className="app-shell" data-dark={dark ? "" : undefined}>
    <Sidebar active={allowedScreen} role={role} onNavigate={(next) => { setSelectedOrderId(null); setScreen(next); }} />
    <div className="app-main">
      <Header screen={allowedScreen} role={role} dark={dark} onToggleDark={() => setDark(d => !d)} onLogout={handleLogout} />
      <main className="content">{content[allowedScreen]}</main>
    </div>
  </div>;
}
