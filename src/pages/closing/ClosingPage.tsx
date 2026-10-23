import { useState } from "react";
import { ApiError } from "@/api/client";
import { closuresApi } from "@/api/closures";
import { DatePicker, fmtDay, fmtLongDay, fmtRange, fmtRangeLong } from "@/components/dates";
import { Badge, Button, Card, Icon, Modal } from "@/components/ui";
import { useApiQuery } from "@/hooks/useApiQuery";
import { formatQuetzales } from "@/lib/format";

/** "AAAA-MM-DD" → Date local, para los selectores y textos */
const fromIsoDate = (iso: string) => {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
};

/** Date → "AAAA-MM-DD" con la fecha local (no UTC) */
const toIsoDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/** 1 → "1 venta", 3 → "3 ventas" */
const salesLabel = (count: number) => `${count} ${count === 1 ? "venta" : "ventas"}`;

const CLOSED_AT_FORMAT = new Intl.DateTimeFormat("es-GT", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Guatemala",
});

export default function ClosingPage({ onHistory }: { onHistory: () => void }) {
  // undefined = hasta hoy (lo que diga el servidor)
  const [chosenEnd, setChosenEnd] = useState<string>();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isUnderstoodConfirmed, setIsUnderstoodConfirmed] = useState(false);
  const [closing, setClosing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [lastClosed, setLastClosed] = useState<string | null>(null);

  const { data: period, error, refetch } = useApiQuery(`closures:open:${chosenEnd ?? "hoy"}`, () => closuresApi.open(chosenEnd));
  const { data: history = [], refetch: refetchHistory } = useApiQuery("closures:history", closuresApi.list);

  if (!period) {
    return <div className="screen-stack">{error ? <div className="cf-warning">{error.message}</div> : <Card>Cargando...</Card>}</div>;
  }

  // Si ya se cerró todo hasta hoy, el período abierto empieza mañana
  const allClosed = period.periodStart > period.today;
  const range = { start: fromIsoDate(period.periodStart), end: fromIsoDate(period.periodEnd) };
  const includesToday = period.periodEnd === period.today;

  const closeModal = () => {
    setIsModalOpen(false);
    setIsUnderstoodConfirmed(false);
  };

  const handleConfirmClose = async () => {
    setClosing(true);
    setActionError(null);
    try {
      const created = await closuresApi.close({ periodStart: period.periodStart, periodEnd: period.periodEnd });
      setLastClosed(fmtRange({ start: fromIsoDate(created.periodStart), end: fromIsoDate(created.periodEnd) }));
      setChosenEnd(undefined);
      await Promise.all([refetch(), refetchHistory()]);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "No se pudo cerrar el período");
      await refetch();
    } finally {
      setClosing(false);
      closeModal();
    }
  };

  return (
    <div className="screen-stack">
      {lastClosed && (
        <div className="info-banner">
          <Icon name="check" />
          <div>
            <strong>Período cerrado</strong>
            <span>Las ventas del {lastClosed} quedaron en solo lectura.</span>
          </div>
        </div>
      )}
      {(error || actionError) && <div className="cf-warning">{actionError ?? error?.message}</div>}

      {allClosed ? (
        <Card className="closing-hero">
          <div>
            <Badge tone="success">Todo cerrado</Badge>
            <div className="section-title">No hay días pendientes de cierre</div>
            <div className="muted">Las ventas están cerradas hasta hoy. Las de mañana formarán el siguiente período.</div>
          </div>
        </Card>
      ) : (
        <>
          <Card className="closing-hero">
            <div>
              <Badge tone="warning">Período abierto</Badge>
              <div className="section-title">Cierre del {fmtRangeLong(range)}</div>
              <div className="muted">Verifica que todos los movimientos estén registrados antes de cerrar.</div>
            </div>
            <div className="closing-range">
              <div className="field">
                <span className="field-label">Desde</span>
                <div className="readonly-from" title="Día siguiente al último cierre">
                  <Icon name="lock" size="sm" />
                  {fmtLongDay(range.start)}
                </div>
              </div>
              <DatePicker
                label="Hasta"
                value={range.end}
                onChange={(date) => setChosenEnd(toIsoDate(date))}
                min={range.start}
                max={fromIsoDate(period.today)}
                align="right"
              />
            </div>
          </Card>

          <div className="payment-totals">
            <Card>
              <Icon name="cash" />
              <span>Efectivo</span>
              <strong>{formatQuetzales(period.cashAmount)}</strong>
              <small>{salesLabel(period.cashCount)}</small>
            </Card>
            <Card>
              <Icon name="bank" />
              <span>Transferencia</span>
              <strong>{formatQuetzales(period.transferAmount)}</strong>
              <small>{salesLabel(period.transferCount)}</small>
            </Card>
            <Card>
              <Icon name="card" />
              <span>Tarjeta</span>
              <strong>{formatQuetzales(period.cardAmount)}</strong>
              <small>{salesLabel(period.cardCount)}</small>
            </Card>
            <Card className="total-card">
              <Icon name="trending" />
              <span>Total general</span>
              <strong>{formatQuetzales(period.totalAmount)}</strong>
              <small>{salesLabel(period.salesCount)}</small>
            </Card>
          </div>

          {period.pendingCommissionCount > 0 && (
            <div className="comm-pending-banner">
              <Icon name="coins" size="sm" />
              <span>
                Hay <strong>{salesLabel(period.pendingCommissionCount)}</strong> con comisión pendiente en este período. Asígnalas antes de
                cerrar: después ya no se podrán modificar.
              </span>
              <button type="button" className="forgot-link" onClick={onHistory}>
                Ver ventas
              </button>
            </div>
          )}

          <div className="close-action">
            <div>
              <strong>¿Todo está correcto?</strong>
              <span>
                {period.salesCount === 0
                  ? "No hay ventas en este período."
                  : "Después del cierre no podrás agregar, modificar ni eliminar ventas de este período."}
              </span>
            </div>
            <Button icon="lock" onClick={() => setIsModalOpen(true)} disabled={period.salesCount === 0 || closing}>
              Cerrar período
            </Button>
          </div>
        </>
      )}

      <Card>
        <div className="card-title">Cierres anteriores</div>
        {history.length === 0 ? (
          <div className="muted small">Todavía no se ha hecho ningún cierre.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Período</th>
                  <th>Fecha de cierre</th>
                  <th>Ventas</th>
                  <th>Efectivo</th>
                  <th>Transferencia</th>
                  <th>Tarjeta</th>
                  <th>Total</th>
                  <th>Responsable</th>
                </tr>
              </thead>
              <tbody>
                {history.map((closure) => (
                  <tr key={closure.id}>
                    <td>
                      {closure.periodStart === closure.periodEnd
                        ? fmtDay(fromIsoDate(closure.periodStart))
                        : fmtRange({ start: fromIsoDate(closure.periodStart), end: fromIsoDate(closure.periodEnd) })}
                    </td>
                    <td>{CLOSED_AT_FORMAT.format(new Date(closure.closedAt))}</td>
                    <td>{closure.salesCount}</td>
                    <td>{formatQuetzales(closure.cashAmount)}</td>
                    <td>{formatQuetzales(closure.transferAmount)}</td>
                    <td>{formatQuetzales(closure.cardAmount)}</td>
                    <td>
                      <strong>{formatQuetzales(closure.totalAmount)}</strong>
                    </td>
                    <td>{closure.closedBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={isModalOpen}
        title={`¿Cerrar el período del ${fmtRangeLong(range)}?`}
        onClose={closeModal}
        onConfirm={handleConfirmClose}
        confirmLabel={closing ? "Cerrando..." : "Confirmar cierre"}
        confirmDisabled={!isUnderstoodConfirmed || closing}
      >
        <div className="warning-box">
          <Icon name="lock" />
          <span>
            Esta acción no se puede deshacer. Después del cierre no se podrán agregar, modificar ni eliminar ventas de este período.
            {includesToday && " Como incluye hoy, ya no se podrán registrar más ventas el día de hoy."}
          </span>
        </div>
        {period.pendingCommissionCount > 0 && (
          <div className="warning-box">
            <Icon name="coins" />
            <span>
              {period.pendingCommissionCount === 1 ? "1 venta quedará" : `${period.pendingCommissionCount} ventas quedarán`} con la comisión pendiente para siempre, porque después del cierre ya no se
              pueden asignar.
            </span>
          </div>
        )}
        <div className="confirm-box">
          <div>
            <span>Período</span>
            <strong>{fmtRange(range)}</strong>
          </div>
          <div>
            <span>Ventas</span>
            <strong>{period.salesCount}</strong>
          </div>
          <div>
            <span>Total</span>
            <strong>{formatQuetzales(period.totalAmount)}</strong>
          </div>
        </div>
        <label className="understood-check">
          <input type="checkbox" checked={isUnderstoodConfirmed} onChange={(e) => setIsUnderstoodConfirmed(e.target.checked)} />
          <span>Entiendo que esta acción es definitiva</span>
        </label>
      </Modal>
    </div>
  );
}