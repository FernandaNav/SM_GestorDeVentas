import { useState, type MouseEvent } from "react";
import { formatQuetzales } from "@/lib/format";
import "./charts.css";

// Gráficas hechas con SVG y HTML, sin librerías (RF 4.3). Las comparten Dashboard y
// Estadísticas. Colores en orden fijo, revisado para daltonismo: naranja, azul, verde, morado.
export const SERIES_COLORS = ["var(--color-primary)", "var(--color-blue)", "var(--color-success)", "var(--color-purple)"];
export const COMPARE_COLOR = "#9da3ad";

const VIEW_W = 800;
const VIEW_H = 200;
const GRID_STEPS = 4;

/** Q 1,250 → "Q 1.3k"; para los ejes, donde no cabe el monto completo. */
export function formatCompactQ(amount: number): string {
  if (Math.abs(amount) >= 1_000_000) return `Q ${(amount / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (Math.abs(amount) >= 1_000) return `Q ${(amount / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return `Q ${Math.round(amount)}`;
}

/** Variación porcentual contra el período anterior; null si antes no hubo nada. */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

export function formatChange(current: number, previous: number): string {
  const change = percentChange(current, previous);
  if (change === null) return current === 0 ? "Sin cambio" : "Sin datos del período anterior";
  const sign = change > 0 ? "+" : change < 0 ? "−" : "";
  return `${sign}${Math.abs(change).toFixed(1)} %`;
}

/** Tope del eje redondeado (1, 2, 2.5 o 5 × 10ⁿ por línea) para que las marcas sean legibles. */
function niceMax(value: number): number {
  if (value <= 0) return GRID_STEPS;
  const rawStep = value / GRID_STEPS;
  const power = 10 ** Math.floor(Math.log10(rawStep));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((candidate) => candidate >= rawStep)!;
  return step * GRID_STEPS;
}

function tickIndexes(count: number, maxTicks = 6): number[] {
  if (count <= maxTicks) return Array.from({ length: count }, (_, i) => i);
  const step = (count - 1) / (maxTicks - 1);
  return Array.from({ length: maxTicks }, (_, i) => Math.round(i * step));
}

// ─── línea en el tiempo ─────────────────────────────────────────────────────

export type LineSeries = {
  name: string;
  values: number[];
  /** sales: línea sólida con área · expense: gris punteada · compare: período anterior */
  kind: "sales" | "expense" | "compare";
  /** Texto del tooltip por punto, si difiere del eje (p. ej. la fecha del período anterior) */
  pointLabels?: string[];
};

export function LineChart({
  labels,
  tooltipLabels = labels,
  series,
  height = 220,
  format = formatQuetzales,
}: {
  /** Etiqueta corta de cada punto para el eje X */
  labels: string[];
  tooltipLabels?: string[];
  series: LineSeries[];
  height?: number;
  format?: (value: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const count = labels.length;
  const max = niceMax(Math.max(0, ...series.flatMap((s) => s.values)));
  const xOf = (index: number) => (count <= 1 ? VIEW_W / 2 : (index / (count - 1)) * VIEW_W);
  const yOf = (value: number) => VIEW_H - (value / max) * VIEW_H;
  const pathOf = (values: number[]) =>
    values
      .slice(0, count)
      .map((value, index) => `${index === 0 ? "M" : "L"}${xOf(index).toFixed(1)} ${yOf(value).toFixed(1)}`)
      .join(" ");

  const handleMove = (event: MouseEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
    setHover(count <= 1 ? 0 : Math.round(fraction * (count - 1)));
  };

  const colorOf = (s: LineSeries) => (s.kind === "sales" ? SERIES_COLORS[0] : COMPARE_COLOR);
  const hoverLeft = hover === null ? 0 : (xOf(hover) / VIEW_W) * 100;

  return (
    <div className="rpt-line" style={{ ["--rpt-h" as string]: `${height}px` }}>
      <div className="rpt-line-yaxis" aria-hidden="true">
        {Array.from({ length: GRID_STEPS + 1 }, (_, i) => (
          <span key={i}>{formatCompactQ(max - (max / GRID_STEPS) * i)}</span>
        ))}
      </div>
      <div className="rpt-line-plot" onMouseMove={handleMove} onMouseLeave={() => setHover(null)} role="img" aria-label={series.map((s) => s.name).join(" vs. ")}>
        <div className="grid-lines">
          {Array.from({ length: GRID_STEPS + 1 }, (_, i) => (
            <span key={i} />
          ))}
        </div>
        <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="none" aria-hidden="true">
          {series.map((s) =>
            s.kind === "sales" ? (
              <g key={s.name}>
                <path className="area-path" d={`${pathOf(s.values)} L${xOf(Math.min(count, s.values.length) - 1)} ${VIEW_H} L0 ${VIEW_H}Z`} />
                <path className="sales-path" d={pathOf(s.values)} />
              </g>
            ) : (
              <path key={s.name} className={s.kind === "expense" ? "expense-path" : "compare-path"} d={pathOf(s.values)} />
            ),
          )}
        </svg>
        {hover !== null && (
          <>
            <span className="rpt-hover-line" style={{ left: `${hoverLeft}%` }} />
            {series.map((s) =>
              s.values[hover] === undefined ? null : (
                <span
                  key={s.name}
                  className="rpt-hover-dot"
                  style={{ left: `${hoverLeft}%`, top: `${(yOf(s.values[hover]) / VIEW_H) * 100}%`, background: colorOf(s) }}
                />
              ),
            )}
            <div className="rpt-tooltip" style={hoverLeft > 60 ? { right: `${100 - hoverLeft + 2}%` } : { left: `${hoverLeft + 2}%` }}>
              <strong>{tooltipLabels[hover]}</strong>
              {series.map((s) =>
                s.values[hover] === undefined ? null : (
                  <div key={s.name}>
                    <i className={`rpt-swatch ${s.kind === "sales" ? "" : "dashed"}`} style={{ background: colorOf(s) }} />
                    {s.pointLabels ? `${s.name} (${s.pointLabels[hover]})` : s.name}
                    <b>{format(s.values[hover])}</b>
                  </div>
                ),
              )}
            </div>
          </>
        )}
      </div>
      <div className="rpt-line-xaxis" aria-hidden="true">
        {tickIndexes(count).map((index) => (
          <span key={index} style={{ left: `${(xOf(index) / VIEW_W) * 100}%` }}>
            {labels[index]}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Leyenda para las líneas: el color nunca es la única pista (también el nombre y el trazo). */
export function LineLegend({ series }: { series: Pick<LineSeries, "name" | "kind">[] }) {
  return (
    <div className="legend">
      {series.map((s) => (
        <span key={s.name}>
          <i className={`rpt-swatch ${s.kind === "sales" ? "" : "dashed"}`} style={{ background: s.kind === "sales" ? SERIES_COLORS[0] : COMPARE_COLOR, marginRight: 5 }} />
          {s.name}
        </span>
      ))}
    </div>
  );
}

// ─── barras horizontales (ranking) ──────────────────────────────────────────

export type BarRow = { key: string | number; label: string; detail?: string; value: number; previous?: number };

/** Un solo color: el largo de la barra es lo que compara. La marca gris es el período anterior. */
/** `lowerIsBetter`: para gastos, subir se marca en rojo y bajar en verde. */
export function BarList({
  rows,
  format = formatQuetzales,
  showChange = false,
  lowerIsBetter = false,
}: {
  rows: BarRow[];
  format?: (v: number) => string;
  showChange?: boolean;
  lowerIsBetter?: boolean;
}) {
  const max = Math.max(1, ...rows.flatMap((row) => [row.value, row.previous ?? 0]));
  return (
    <div className="rpt-bars">
      {rows.map((row) => {
        const change = row.previous === undefined ? null : percentChange(row.value, row.previous);
        return (
          <div className="rpt-bar-row" key={row.key} title={`${row.label}: ${format(row.value)}`}>
            <span>
              {row.label}
              {row.detail && <small>{row.detail}</small>}
            </span>
            <span className="rpt-bar-track">
              <span className="rpt-bar-fill" style={{ width: `${(row.value / max) * 100}%` }} />
              {showChange && row.previous !== undefined && row.previous > 0 && (
                <span className="rpt-bar-prev" style={{ left: `${(row.previous / max) * 100}%` }} title={`Período anterior: ${format(row.previous)}`} />
              )}
            </span>
            <span className="rpt-bar-value">
              {format(row.value)}
              {showChange && row.previous !== undefined && (
                <small className={change === null || change === 0 ? "" : change > 0 !== lowerIsBetter ? "rpt-delta-up" : "rpt-delta-down"}>
                  {change === null ? "Nuevo" : formatChange(row.value, row.previous)}
                </small>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── barra apilada (participación) ──────────────────────────────────────────

export type StackSegment = { label: string; value: number };

export function StackBar({ segments, format = formatQuetzales }: { segments: StackSegment[]; format?: (v: number) => string }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  return (
    <>
      <div className="rpt-stack" role="img" aria-label={segments.map((s) => `${s.label} ${format(s.value)}`).join(", ")}>
        {segments.map((s, i) =>
          s.value > 0 ? (
            <span key={s.label} title={`${s.label}: ${format(s.value)}`} style={{ flex: s.value, background: SERIES_COLORS[i] }} />
          ) : null,
        )}
      </div>
      <div className="rpt-legend">
        {segments.map((s, i) => (
          <span key={s.label}>
            <i className="dot" style={{ background: SERIES_COLORS[i] }} />
            {s.label}
            <b>{format(s.value)}</b> · {total > 0 ? ((s.value / total) * 100).toFixed(1) : "0.0"} %
          </span>
        ))}
      </div>
    </>
  );
}
