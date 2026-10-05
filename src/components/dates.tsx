import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "./ui";

// ─── helpers de fechas ───────────────────────────────────────────────────────

export type DateRange = { start: Date; end: Date };

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
export const endOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
export const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1);
// Semana de lunes a domingo
export const startOfWeek = (d: Date) => addDays(startOfDay(d), -((d.getDay() + 6) % 7));
export const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const sameMonth = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
const daysBetween = (a: Date, b: Date) => Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86_400_000);

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const MONTHS = Array.from({ length: 12 }, (_, i) => new Intl.DateTimeFormat("es-GT", { month: "long" }).format(new Date(2026, i, 1)));
const SHORT = new Intl.DateTimeFormat("es-GT", { day: "numeric", month: "short" });
const WEEKDAYS = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"];

/** "Septiembre 2026" */
export const fmtMonth = (d: Date) => `${capitalize(MONTHS[d.getMonth()])} ${d.getFullYear()}`;
/** "30 sept" */
export const fmtDayMonth = (d: Date) => SHORT.format(d);
/** "Sept" */
export const fmtMonthShort = (d: Date) => capitalize(new Intl.DateTimeFormat("es-GT", { month: "short" }).format(d));
/** "30 sept 2026" */
export const fmtDay = (d: Date) => `${SHORT.format(d)} ${d.getFullYear()}`;
/** "30 de septiembre de 2026" */
export const fmtLongDay = (d: Date) => `${d.getDate()} de ${MONTHS[d.getMonth()]} de ${d.getFullYear()}`;
/** "1 – 30 sept 2026", "28 sept – 4 oct 2026" o "15 dic 2025 – 3 ene 2026" */
export function fmtRange({ start, end }: DateRange) {
  if (sameDay(start, end)) return fmtDay(start);
  if (sameMonth(start, end)) return `${start.getDate()} – ${fmtDay(end)}`;
  if (start.getFullYear() === end.getFullYear()) return `${SHORT.format(start)} – ${fmtDay(end)}`;
  return `${fmtDay(start)} – ${fmtDay(end)}`;
}
/** "1 al 14 de septiembre de 2026" o "1 de septiembre al 3 de octubre de 2026" */
export function fmtRangeLong({ start, end }: DateRange) {
  if (sameDay(start, end)) return fmtLongDay(start);
  if (sameMonth(start, end)) return `${start.getDate()} al ${fmtLongDay(end)}`;
  if (start.getFullYear() === end.getFullYear()) return `${start.getDate()} de ${MONTHS[start.getMonth()]} al ${fmtLongDay(end)}`;
  return `${fmtLongDay(start)} al ${fmtLongDay(end)}`;
}

export function rangePresets(today: Date): { label: string; range: DateRange }[] {
  const t = startOfDay(today);
  const prevMonth = addMonths(t, -1);
  return [
    { label: "Hoy", range: { start: t, end: t } },
    { label: "Ayer", range: { start: addDays(t, -1), end: addDays(t, -1) } },
    { label: "Últimos 7 días", range: { start: addDays(t, -6), end: t } },
    { label: "Últimos 30 días", range: { start: addDays(t, -29), end: t } },
    { label: "Esta semana", range: { start: startOfWeek(t), end: t } },
    { label: "Este mes", range: { start: startOfMonth(t), end: t } },
    { label: "Mes anterior", range: { start: prevMonth, end: endOfMonth(prevMonth) } },
    { label: "Este año", range: { start: new Date(t.getFullYear(), 0, 1), end: t } },
  ];
}

export const presetRange = (label: string, today = new Date()) => rangePresets(today).find((p) => p.label === label)!.range;
const presetLabel = (r: DateRange, today: Date) => rangePresets(today).find((p) => sameDay(p.range.start, r.start) && sameDay(p.range.end, r.end))?.label;

// ─── períodos para estadísticas ──────────────────────────────────────────────

export type Granularity = "Diario" | "Semanal" | "Mensual" | "Anual";

export function periodRange(g: Granularity, anchor: Date): DateRange {
  const a = startOfDay(anchor);
  if (g === "Diario") return { start: a, end: a };
  if (g === "Semanal") return { start: startOfWeek(a), end: addDays(startOfWeek(a), 6) };
  if (g === "Mensual") return { start: startOfMonth(a), end: endOfMonth(a) };
  return { start: new Date(a.getFullYear(), 0, 1), end: new Date(a.getFullYear(), 11, 31) };
}

export function periodLabel(g: Granularity, anchor: Date) {
  if (g === "Diario") return capitalize(new Intl.DateTimeFormat("es-GT", { weekday: "long" }).format(anchor)) + ", " + fmtLongDay(anchor);
  if (g === "Semanal") return fmtRange(periodRange(g, anchor));
  if (g === "Mensual") return fmtMonth(anchor);
  return String(anchor.getFullYear());
}

export function shiftPeriod(g: Granularity, anchor: Date, dir: 1 | -1) {
  if (g === "Diario") return addDays(anchor, dir);
  if (g === "Semanal") return addDays(anchor, 7 * dir);
  if (g === "Mensual") return addMonths(anchor, dir);
  return new Date(anchor.getFullYear() + dir, 0, 1);
}

/** Rango del mismo largo inmediatamente anterior (para "comparar con período anterior") */
export function previousRange({ start, end }: DateRange): DateRange {
  const len = daysBetween(start, end);
  return { start: addDays(start, -len - 1), end: addDays(start, -1) };
}

// ─── popover ─────────────────────────────────────────────────────────────────

function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  return { open, setOpen, ref };
}

/** Alinea el popover hacia el lado preferido, pero lo voltea si se saldría de la pantalla */
function useAutoAlign(open: boolean, preferred: "left" | "right") {
  const popRef = useRef<HTMLDivElement>(null);
  const [side, setSide] = useState(preferred);
  useLayoutEffect(() => {
    if (!open) { setSide(preferred); return; }
    const el = popRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.right > window.innerWidth - 8 && side === "left") setSide("right");
    else if (r.left < 8 && side === "right") setSide("left");
  }, [open, side, preferred]);
  return { side, popRef };
}

function PickerField({ label, children }: { label?: string; children: ReactNode }) {
  return <div className="field">{label && <span className="field-label">{label}</span>}{children}</div>;
}

// ─── calendario ──────────────────────────────────────────────────────────────

function Calendar({ month, onMonthChange, onPick, onHover, isSelected, isInRange, min, max }: {
  month: Date; onMonthChange: (m: Date) => void; onPick: (d: Date) => void; onHover?: (d: Date | null) => void;
  isSelected: (d: Date) => boolean; isInRange?: (d: Date) => boolean; min?: Date; max?: Date;
}) {
  const first = startOfWeek(startOfMonth(month));
  const days = Array.from({ length: 42 }, (_, i) => addDays(first, i));
  const today = new Date();
  const disabled = (d: Date) => (!!max && startOfDay(d) > startOfDay(max)) || (!!min && startOfDay(d) < startOfDay(min));
  const canPrev = !min || startOfMonth(month) > startOfMonth(min);
  const canNext = !max || startOfMonth(month) < startOfMonth(max);
  return <div className="calendar" onMouseLeave={() => onHover?.(null)}>
    <div className="calendar-head">
      <button type="button" className="calendar-nav prev" aria-label="Mes anterior" disabled={!canPrev} onClick={() => onMonthChange(addMonths(month, -1))}><Icon name="chevron" size="sm" /></button>
      <strong>{fmtMonth(month)}</strong>
      <button type="button" className="calendar-nav" aria-label="Mes siguiente" disabled={!canNext} onClick={() => onMonthChange(addMonths(month, 1))}><Icon name="chevron" size="sm" /></button>
    </div>
    <div className="calendar-grid">
      {WEEKDAYS.map((w) => <span key={w} className="calendar-weekday">{w}</span>)}
      {days.map((d) => {
        const cls = ["calendar-day"];
        if (d.getMonth() !== month.getMonth()) cls.push("outside");
        if (sameDay(d, today)) cls.push("today");
        if (isInRange?.(d)) cls.push("in-range");
        if (isSelected(d)) cls.push("selected");
        return <button type="button" key={d.toISOString()} className={cls.join(" ")} disabled={disabled(d)} onClick={() => onPick(d)} onMouseEnter={() => onHover?.(d)}>{d.getDate()}</button>;
      })}
    </div>
  </div>;
}

// ─── selector de un día ──────────────────────────────────────────────────────

export function DatePicker({ label, value, onChange, min, max, align = "left" }: { label?: string; value: Date; onChange: (d: Date) => void; min?: Date; max?: Date; align?: "left" | "right" }) {
  const { open, setOpen, ref } = usePopover();
  const { side, popRef } = useAutoAlign(open, align);
  const [month, setMonth] = useState(startOfMonth(value));
  const today = startOfDay(new Date());
  const todayAllowed = (!max || today <= startOfDay(max)) && (!min || today >= startOfDay(min));
  const toggle = () => { if (!open) setMonth(startOfMonth(value)); setOpen(!open); };
  const pick = (d: Date) => { onChange(d); setOpen(false); };
  return <PickerField label={label}>
    <div className="picker" ref={ref}>
      <button type="button" className={`picker-trigger${open ? " is-open" : ""}`} onClick={toggle} aria-haspopup="dialog" aria-expanded={open}>
        <Icon name="calendar" size="sm" /><span>{fmtLongDay(value)}</span><Icon name="chevron" size="sm" />
      </button>
      {open && <div ref={popRef} className={`picker-popover align-${side}`} role="dialog" aria-label={label ?? "Seleccionar fecha"}>
        <Calendar month={month} onMonthChange={setMonth} onPick={pick} isSelected={(d) => sameDay(d, value)} min={min} max={max} />
        <div className="picker-footer">
          <button type="button" className="picker-link" disabled={!todayAllowed} onClick={() => pick(today)}>Hoy</button>
        </div>
      </div>}
    </div>
  </PickerField>;
}

// ─── selector de rango ───────────────────────────────────────────────────────

export function DateRangePicker({ label, value, onChange, max = new Date(), align = "left" }: { label?: string; value: DateRange; onChange: (r: DateRange) => void; max?: Date; align?: "left" | "right" }) {
  const { open, setOpen, ref } = usePopover();
  const { side, popRef } = useAutoAlign(open, align);
  const [month, setMonth] = useState(startOfMonth(value.end));
  const [draftStart, setDraftStart] = useState<Date | null>(null);
  const [hover, setHover] = useState<Date | null>(null);
  const today = new Date();
  const preset = presetLabel(value, today);

  const toggle = () => {
    if (!open) { setMonth(startOfMonth(value.end)); setDraftStart(null); setHover(null); }
    setOpen(!open);
  };
  const apply = (r: DateRange) => { onChange(r); setOpen(false); setDraftStart(null); };
  const pick = (d: Date) => {
    if (!draftStart) { setDraftStart(d); return; }
    apply(d < draftStart ? { start: d, end: draftStart } : { start: draftStart, end: d });
  };

  // Mientras se elige: del primer clic al día bajo el mouse; si no, el rango actual
  const shown: DateRange = draftStart
    ? (hover && hover < draftStart ? { start: hover, end: draftStart } : { start: draftStart, end: hover ?? draftStart })
    : value;
  const inRange = (d: Date) => startOfDay(d) >= startOfDay(shown.start) && startOfDay(d) <= startOfDay(shown.end);
  const isEdge = (d: Date) => sameDay(d, shown.start) || sameDay(d, shown.end);

  return <PickerField label={label}>
    <div className="picker" ref={ref}>
      <button type="button" className={`picker-trigger${open ? " is-open" : ""}`} onClick={toggle} aria-haspopup="dialog" aria-expanded={open}>
        <Icon name="calendar" size="sm" />
        <span>{preset ? <><strong>{preset}</strong> · {fmtRange(value)}</> : fmtRange(value)}</span>
        <Icon name="chevron" size="sm" />
      </button>
      {open && <div ref={popRef} className={`picker-popover range align-${side}`} role="dialog" aria-label={label ?? "Seleccionar rango de fechas"}>
        <div className="picker-presets">
          {rangePresets(today).map((p) => <button type="button" key={p.label} className={preset === p.label ? "active" : ""} onClick={() => apply(p.range)}>{p.label}</button>)}
        </div>
        <div>
          <Calendar month={month} onMonthChange={setMonth} onPick={pick} onHover={setHover} isSelected={isEdge} isInRange={inRange} max={max} />
          <div className="picker-footer">
            <span className="picker-hint">{draftStart ? "Ahora elige la fecha final" : "Elige la fecha inicial o un rango rápido"}</span>
          </div>
        </div>
      </div>}
    </div>
  </PickerField>;
}

// ─── selector de mes ─────────────────────────────────────────────────────────

export function MonthPicker({ label, value, onChange, max = new Date(), align = "right" }: { label?: string; value: Date; onChange: (m: Date) => void; max?: Date; align?: "left" | "right" }) {
  const { open, setOpen, ref } = usePopover();
  const { side, popRef } = useAutoAlign(open, align);
  const [year, setYear] = useState(value.getFullYear());
  const maxMonth = startOfMonth(max);
  const canNext = startOfMonth(value) < maxMonth;
  const toggle = () => { if (!open) setYear(value.getFullYear()); setOpen(!open); };
  return <PickerField label={label}>
    <div className="picker month-stepper" ref={ref}>
      <button type="button" className="stepper-btn prev" aria-label="Mes anterior" onClick={() => onChange(addMonths(value, -1))}><Icon name="chevron" size="sm" /></button>
      <button type="button" className={`picker-trigger compact${open ? " is-open" : ""}`} onClick={toggle} aria-haspopup="dialog" aria-expanded={open}><span>{fmtMonth(value)}</span></button>
      <button type="button" className="stepper-btn" aria-label="Mes siguiente" disabled={!canNext} onClick={() => onChange(addMonths(value, 1))}><Icon name="chevron" size="sm" /></button>
      {open && <div ref={popRef} className={`picker-popover align-${side}`} role="dialog" aria-label={label ?? "Seleccionar mes"}>
        <div className="calendar-head">
          <button type="button" className="calendar-nav prev" aria-label="Año anterior" onClick={() => setYear(year - 1)}><Icon name="chevron" size="sm" /></button>
          <strong>{year}</strong>
          <button type="button" className="calendar-nav" aria-label="Año siguiente" disabled={year >= max.getFullYear()} onClick={() => setYear(year + 1)}><Icon name="chevron" size="sm" /></button>
        </div>
        <div className="month-grid">
          {MONTHS.map((m, i) => {
            const d = new Date(year, i, 1);
            return <button type="button" key={m} className={sameMonth(d, value) ? "selected" : ""} disabled={d > maxMonth} onClick={() => { onChange(d); setOpen(false); }}>{capitalize(m.slice(0, 3))}</button>;
          })}
        </div>
      </div>}
    </div>
  </PickerField>;
}

// ─── navegador de período (estadísticas) ─────────────────────────────────────

export function PeriodStepper({ label, onPrev, onNext, nextDisabled, onReset, resetDisabled }: { label: string; onPrev: () => void; onNext: () => void; nextDisabled: boolean; onReset: () => void; resetDisabled: boolean }) {
  return <div className="period-stepper">
    <button type="button" className="stepper-btn prev" aria-label="Período anterior" onClick={onPrev}><Icon name="chevron" size="sm" /></button>
    <span className="period-label">{label}</span>
    <button type="button" className="stepper-btn" aria-label="Período siguiente" disabled={nextDisabled} onClick={onNext}><Icon name="chevron" size="sm" /></button>
    <button type="button" className="picker-link" disabled={resetDisabled} onClick={onReset}>Ir al actual</button>
  </div>;
}
