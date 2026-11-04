import { Fragment, useState } from "react";
import type { DeletedSale } from "@shared/schemas/sales";
import { toApiDay } from "@/api/reports";
import { salesApi } from "@/api/sales";
import Pagination from "@/components/Pagination";
import { type DateRange, DateRangePicker, presetRange } from "@/components/dates";
import { Badge, Card, Icon, TextInput } from "@/components/ui";
import { useApiQuery } from "@/hooks/useApiQuery";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { formatQuetzales, SALE_TIME_FORMAT, SHORT_DATE_FORMAT } from "@/lib/format";

const PAGE_SIZE = 20;
const SEARCH_DELAY_MS = 300;

const ORIGIN_LABELS: Record<string, string> = {
  venta: "Venta",
  taller_servicio: "Servicio de taller",
  taller_repuesto: "Repuesto de taller",
};

const dateTime = (iso: string) => `${SHORT_DATE_FORMAT.format(new Date(iso))} · ${SALE_TIME_FORMAT.format(new Date(iso))}`;

// Historial de ventas eliminadas (solo Administrador). Muestra cada venta tal como estaba
// al borrarse, con quién la eliminó, cuándo y por qué (RNF 1.2).
export default function DeletedSalesPanel({ onBack }: { onBack: () => void }) {
  const [range, setRange] = useState<DateRange>(() => presetRange("Últimos 30 días"));
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search.trim(), SEARCH_DELAY_MS);
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const filters = { from: toApiDay(range.start), to: toApiDay(range.end), search: debouncedSearch || undefined };
  const { data, loading, error } = useApiQuery(`sales:deleted:${JSON.stringify(filters)}:${page}`, () =>
    salesApi.listDeleted(filters, page, PAGE_SIZE),
  );
  const rows = data?.items ?? [];

  const onFilter =
    <Value,>(setValue: (value: Value) => void) =>
    (value: Value) => {
      setPage(1);
      setExpandedId(null);
      setValue(value);
    };

  return (
    <div className="screen-stack">
      <div className="hero-row">
        <div className="order-back">
          <button type="button" className="back-btn" onClick={onBack} aria-label="Volver al historial de ventas">
            <Icon name="chevron" size="sm" />
          </button>
          <div>
            <div className="section-title">Ventas eliminadas</div>
            <div className="muted">Cada venta tal como estaba al eliminarse, con quién lo hizo, cuándo y por qué.</div>
          </div>
        </div>
      </div>

      <Card className="history-filters">
        <TextInput placeholder="Buscar por n.º de venta, producto, cliente, NIT o vendedor..." icon="search" value={search} onChange={onFilter(setSearch)} />
        <DateRangePicker value={range} onChange={onFilter(setRange)} />
      </Card>

      <Card>
        {error ? (
          <div className="cf-warning">{error.message}</div>
        ) : loading && rows.length === 0 ? (
          <div className="muted" style={{ padding: 16 }}>Cargando ventas eliminadas...</div>
        ) : rows.length === 0 ? (
          <div className="empty-state-box">
            <div className="empty-state-icon">
              <Icon name="trash" />
            </div>
            <div className="empty-state-title">{debouncedSearch ? "Ninguna venta eliminada coincide con la búsqueda" : "No se eliminaron ventas en estas fechas"}</div>
            <div className="empty-state-desc">El rango de fechas se refiere al día en que se eliminó la venta.</div>
          </div>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Eliminada</th>
                    <th>Venta</th>
                    <th>Fecha de la venta</th>
                    <th>Productos</th>
                    <th>Vendedor</th>
                    <th>Total</th>
                    <th>Motivo</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <DeletedSaleRow
                      key={row.auditId}
                      row={row}
                      expanded={expandedId === row.auditId}
                      onToggle={() => setExpandedId(expandedId === row.auditId ? null : row.auditId)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            {data && (
              <Pagination
                page={data.page}
                pageSize={data.pageSize}
                totalItems={data.totalItems}
                totalPages={data.totalPages}
                onPageChange={(next) => {
                  setPage(next);
                  setExpandedId(null);
                }}
                noun="ventas eliminadas"
              />
            )}
          </>
        )}
      </Card>
    </div>
  );
}

function DeletedSaleRow({ row, expanded, onToggle }: { row: DeletedSale; expanded: boolean; onToggle: () => void }) {
  const { sale } = row;
  const items = sale?.items ?? [];
  const products = items.map((item) => item.description).join(", ") || "—";

  return (
    <Fragment>
      <tr style={{ cursor: "pointer" }} onClick={onToggle} aria-expanded={expanded}>
        <td>
          {dateTime(row.deletedAt)}
          {row.deletedByRole && <div className="muted small">por {row.deletedByRole}</div>}
        </td>
        <td>
          <strong>#{row.saleId}</strong>
        </td>
        <td>{sale?.soldAt ? dateTime(sale.soldAt) : "—"}</td>
        <td>
          <strong>{products}</strong>
          {sale?.client?.name && <div className="muted small">Cliente: {sale.client.name}</div>}
        </td>
        <td>{sale?.sellerName ?? "—"}</td>
        <td>
          <strong>{formatQuetzales(sale?.total ?? 0)}</strong>
        </td>
        <td>{row.reason ?? <span className="muted">Sin motivo</span>}</td>
        <td>
          <span className="muted small">{expanded ? "Ocultar" : "Ver detalle"}</span>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={8} style={{ background: "var(--color-surface-soft)" }}>
            <div className="screen-stack" style={{ padding: "6px 4px" }}>
              <div className="items-table-wrap" style={{ maxWidth: 760 }}>
                <table className="items-table">
                  <thead>
                    <tr>
                      <th>Descripción</th>
                      <th>Categoría</th>
                      <th>Origen</th>
                      <th>Cant.</th>
                      <th>Precio unit.</th>
                      <th>Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <strong>{item.description}</strong>
                        </td>
                        <td>{item.categoryName}</td>
                        <td>{ORIGIN_LABELS[item.origin] ?? "Venta"}</td>
                        <td>{item.quantity}</td>
                        <td>{formatQuetzales(item.unitPrice)}</td>
                        <td className="cell-amount">{formatQuetzales(item.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="order-detail-rows" style={{ maxWidth: 560 }}>
                <div>
                  <span>Método de pago</span>
                  <strong>{sale?.paymentMethod ?? "—"}</strong>
                </div>
                <div>
                  <span>Factura</span>
                  <strong>
                    {sale?.isInvoiced ? (
                      <>
                        <Badge tone="success">Facturada</Badge>{" "}
                        {sale.client ? `${sale.client.taxIdType} ${sale.client.taxId} · ${sale.client.name}` : ""}
                      </>
                    ) : (
                      <Badge tone="neutral">No facturada</Badge>
                    )}
                  </strong>
                </div>
                {sale?.observations && (
                  <div>
                    <span>Observaciones</span>
                    <strong>{sale.observations}</strong>
                  </div>
                )}
                <div>
                  <span>Eliminada</span>
                  <strong>
                    {dateTime(row.deletedAt)}
                    {row.deletedByRole ? ` · ${row.deletedByRole}` : ""}
                  </strong>
                </div>
                <div>
                  <span>Motivo</span>
                  <strong>{row.reason ?? "No se indicó"}</strong>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  );
}
