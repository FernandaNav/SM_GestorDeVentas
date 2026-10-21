import { useState } from "react";
import { DatePicker, fmtLongDay, fmtRange, fmtRangeLong, startOfDay, startOfMonth } from "@/components/dates";
import { Badge, Button, Card, Icon, Modal } from "@/components/ui";
import { formatQuetzales } from "@/lib/format";
import type { SaleRecord } from "@/temporal/localStore";

export default function Closing({
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
