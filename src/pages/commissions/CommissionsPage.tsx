import { useState } from "react";
import type { CommissionItem } from "@shared/schemas/commissions";
import { ApiError } from "@/api/client";
import { commissionsApi } from "@/api/commissions";
import { toApiDay } from "@/api/reports";
import Segmented from "@/components/Segmented";
import { type DateRange, DateRangePicker, fmtRangeLong, presetRange } from "@/components/dates";
import { Badge, Button, Card, Icon } from "@/components/ui";
import { useApiQuery } from "@/hooks/useApiQuery";
import { formatQuetzales, SALE_TIME_FORMAT, SHORT_DATE_FORMAT } from "@/lib/format";
import EmptyState from "@/pages/stats/EmptyState";
import AssignPendingModal from "./AssignPendingModal";

const STATUS_OPTIONS = { Todas: "todas", Pendientes: "pendientes" } as const;
type StatusLabel = keyof typeof STATUS_OPTIONS;

// Comisiones por vendedor y rango de fechas (RF 3.3), y asignación de las pendientes:
// las motos y lo que el mostrador registró sin porcentaje (RF 3.1, 3.2).
export default function CommissionsPage() {
  const [range, setRange] = useState<DateRange>(() => presetRange("Este mes"));
  const [sellerId, setSellerId] = useState<number | null>(null);
  const [status, setStatus] = useState<StatusLabel>("Todas");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [assigning, setAssigning] = useState<CommissionItem[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const apiRange = { from: toApiDay(range.start), to: toApiDay(range.end) };
  const rangeKey = `${apiRange.from}:${apiRange.to}`;
  const sellersQuery = useApiQuery(`commissions:sellers:${rangeKey}`, () => commissionsApi.sellers(apiRange));
  const itemsQuery = useApiQuery(`commissions:items:${rangeKey}:${sellerId}:${status}`, () =>
    commissionsApi.items({ ...apiRange, sellerId: sellerId ?? undefined, status: STATUS_OPTIONS[status] }),
  );

  const sellers = sellersQuery.data ?? [];
  const items = itemsQuery.data ?? [];
  const current = sellerId === null ? null : sellers.find((s) => s.sellerId === sellerId);
  const scope = current ? [current] : sellers;
  const totals = {
    salesCount: scope.reduce((sum, s) => sum + s.salesCount, 0),
    totalSold: scope.reduce((sum, s) => sum + s.totalSold, 0),
    commission: scope.reduce((sum, s) => sum + s.commissionTotal, 0),
    pendingItems: scope.reduce((sum, s) => sum + s.pendingItems, 0),
    pendingSubtotal: scope.reduce((sum, s) => sum + s.pendingSubtotal, 0),
  };

  // Solo se pueden seleccionar los pendientes de períodos abiertos que siguen en pantalla
  const assignable = items.filter((item) => item.commissionRate === null && !item.isClosed);
  const selectedItems = assignable.filter((item) => selected.has(item.id));
  const allSelected = assignable.length > 0 && selectedItems.length === assignable.length;

  const resetSelection = () => setSelected(new Set());
  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleAssign = async (commissionRate: number) => {
    if (!assigning) return;
    try {
      const updated = await commissionsApi.assign({ itemIds: assigning.map((item) => item.id), commissionRate });
      const amount = updated.reduce((sum, item) => sum + (item.commissionAmount ?? 0), 0);
      setNotice(`Comisión de ${commissionRate} % asignada a ${updated.length} ${updated.length === 1 ? "artículo" : "artículos"}: ${formatQuetzales(amount)}.`);
      setAssigning(null);
      resetSelection();
    } finally {
      // También si falló: otra estación pudo haberlos cambiado
      await Promise.all([sellersQuery.refetch(), itemsQuery.refetch()]);
    }
  };

  const error = sellersQuery.error ?? itemsQuery.error;

  return (
    <div className="screen-stack">
      <div className="hero-row">
        <div>
          <div className="section-title">Comisiones por vendedor</div>
          <div className="muted">Qué vendió cada vendedor y cuánta comisión generó en el rango de fechas.</div>
        </div>
        <div className="inline-filters">
          <DateRangePicker
            value={range}
            onChange={(next) => {
              setRange(next);
              resetSelection();
            }}
            align="right"
          />
        </div>
      </div>

      {error && <div className="cf-warning">{error instanceof ApiError ? error.message : "No se pudieron cargar las comisiones"}</div>}
      {notice && (
        <div className="info-banner" role="status">
          <Icon name="check" />
          <div>
            <strong>Listo</strong>
            <span>{notice}</span>
          </div>
        </div>
      )}

      <div className="comm-kpis">
        <Card>
          <span>Total vendido</span>
          <strong>{formatQuetzales(totals.totalSold)}</strong>
          <small>
            {totals.salesCount} {totals.salesCount === 1 ? "venta" : "ventas"}
          </small>
        </Card>
        <Card>
          <span>Comisión asignada</span>
          <strong>{formatQuetzales(totals.commission)}</strong>
          <small>{current ? current.sellerName : "Todos los vendedores"}</small>
        </Card>
        <Card>
          <span>Ticket promedio</span>
          <strong>{formatQuetzales(totals.salesCount > 0 ? totals.totalSold / totals.salesCount : 0)}</strong>
        </Card>
        <Card className={totals.pendingItems > 0 ? "comm-pending-kpi" : ""}>
          <span>Comisiones pendientes</span>
          <strong>{totals.pendingItems}</strong>
          <small>{totals.pendingItems > 0 ? `${formatQuetzales(totals.pendingSubtotal)} vendidos sin comisión` : "Nada por asignar"}</small>
        </Card>
      </div>

      <Card>
        <div className="card-heading">
          <div>
            <div className="card-title">Resumen por vendedor</div>
            <div className="muted small">{fmtRangeLong(range)} · elige un vendedor para ver su detalle</div>
          </div>
        </div>
        {!sellersQuery.loading && sellers.length === 0 ? (
          <EmptyState icon="users" title="Sin vendedores" text="Agrega vendedores en Personal para ver sus comisiones." minHeight={140} />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Vendedor</th>
                  <th>Ventas</th>
                  <th>Total vendido</th>
                  <th>Comisión asignada</th>
                  <th>Pendientes</th>
                </tr>
              </thead>
              <tbody>
                <SellerRow
                  name="Todos los vendedores"
                  selected={sellerId === null}
                  onClick={() => {
                    setSellerId(null);
                    resetSelection();
                  }}
                  salesCount={sellers.reduce((sum, s) => sum + s.salesCount, 0)}
                  totalSold={sellers.reduce((sum, s) => sum + s.totalSold, 0)}
                  commission={sellers.reduce((sum, s) => sum + s.commissionTotal, 0)}
                  pendingItems={sellers.reduce((sum, s) => sum + s.pendingItems, 0)}
                />
                {sellers.map((s) => (
                  <SellerRow
                    key={s.sellerId}
                    name={s.isActive ? s.sellerName : `${s.sellerName} (inactivo)`}
                    selected={sellerId === s.sellerId}
                    onClick={() => {
                      setSellerId(s.sellerId);
                      resetSelection();
                    }}
                    salesCount={s.salesCount}
                    totalSold={s.totalSold}
                    commission={s.commissionTotal}
                    pendingItems={s.pendingItems}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <div className="card-heading rpt-toolbar">
          <div>
            <div className="card-title">Detalle de ventas — {current?.sellerName ?? "todos los vendedores"}</div>
            <div className="muted small">{fmtRangeLong(range)} · la comisión se calcula por artículo</div>
          </div>
          <div className="inline-filters" style={{ alignItems: "center" }}>
            {selectedItems.length > 0 && (
              <Button icon="coins" onClick={() => setAssigning(selectedItems)}>
                Asignar a {selectedItems.length} {selectedItems.length === 1 ? "artículo" : "artículos"}
              </Button>
            )}
            <Segmented
              options={Object.keys(STATUS_OPTIONS)}
              value={status}
              onChange={(value) => {
                setStatus(value as StatusLabel);
                resetSelection();
              }}
            />
          </div>
        </div>

        {itemsQuery.loading && items.length === 0 ? (
          <div className="rpt-loading">Cargando…</div>
        ) : items.length === 0 ? (
          <EmptyState
            icon="coins"
            title={status === "Pendientes" ? "No hay comisiones pendientes" : "Sin ventas en este rango"}
            text={status === "Pendientes" ? "Todas las ventas del rango ya tienen su comisión asignada." : "Cuando se registren ventas en estas fechas aparecerán aquí con su comisión."}
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      className="rpt-check"
                      aria-label="Seleccionar todos los pendientes"
                      disabled={assignable.length === 0}
                      checked={allSelected}
                      onChange={() => setSelected(allSelected ? new Set() : new Set(assignable.map((item) => item.id)))}
                    />
                  </th>
                  <th>Fecha</th>
                  <th>Venta</th>
                  {sellerId === null && <th>Vendedor</th>}
                  <th>Artículo</th>
                  <th>Categoría</th>
                  <th>Pago</th>
                  <th>Subtotal</th>
                  <th>%</th>
                  <th>Comisión</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const pending = item.commissionRate === null;
                  const canAssign = pending && !item.isClosed;
                  return (
                    <tr key={item.id}>
                      <td>
                        {canAssign && (
                          <input type="checkbox" className="rpt-check" aria-label={`Seleccionar ${item.description}`} checked={selected.has(item.id)} onChange={() => toggle(item.id)} />
                        )}
                      </td>
                      <td>
                        {SHORT_DATE_FORMAT.format(new Date(item.soldAt))} · {SALE_TIME_FORMAT.format(new Date(item.soldAt))}
                      </td>
                      <td>#{item.saleId}</td>
                      {sellerId === null && <td>{item.sellerName}</td>}
                      <td>
                        <strong>{item.description}</strong>
                        {item.quantity > 1 && ` × ${item.quantity}`}
                      </td>
                      <td>{item.categoryName}</td>
                      <td>{item.paymentMethod}</td>
                      <td>
                        <strong>{formatQuetzales(item.subtotal)}</strong>
                      </td>
                      <td>{pending ? "—" : `${item.commissionRate} %`}</td>
                      <td>{pending ? <Badge tone="warning">Pendiente</Badge> : <strong>{formatQuetzales(item.commissionAmount ?? 0)}</strong>}</td>
                      <td>
                        {canAssign ? (
                          <button type="button" className="assign-chip" onClick={() => setAssigning([item])}>
                            Asignar
                          </button>
                        ) : pending ? (
                          <span title="El período de esta venta ya se cerró">
                            <Badge tone="neutral">Período cerrado</Badge>
                          </span>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {assigning && <AssignPendingModal items={assigning} onClose={() => setAssigning(null)} onSave={handleAssign} />}
    </div>
  );
}

function SellerRow({
  name,
  selected,
  onClick,
  salesCount,
  totalSold,
  commission,
  pendingItems,
}: {
  name: string;
  selected: boolean;
  onClick: () => void;
  salesCount: number;
  totalSold: number;
  commission: number;
  pendingItems: number;
}) {
  return (
    <tr className={`rpt-clickable ${selected ? "rpt-row-selected" : ""}`} onClick={onClick} aria-selected={selected}>
      <td>
        <strong>{name}</strong>
      </td>
      <td>{salesCount}</td>
      <td>
        <strong>{formatQuetzales(totalSold)}</strong>
      </td>
      <td>{formatQuetzales(commission)}</td>
      <td>{pendingItems > 0 ? <Badge tone="warning">{pendingItems} por asignar</Badge> : <span className="muted">—</span>}</td>
    </tr>
  );
}
