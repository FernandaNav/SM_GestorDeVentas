import { useState } from "react";
import { useNavigate } from "react-router";
import type { SaleDetail } from "@shared/schemas/sales";
import { formatOrderNumber, nextWorkshopStatus, type WorkshopCheckoutInput } from "@shared/schemas/workshop";
import { ApiError } from "@/api/client";
import { workshopApi } from "@/api/workshop";
import { Button, Card, Icon } from "@/components/ui";
import { useApiQuery } from "@/hooks/useApiQuery";
import { formatQuetzales } from "@/lib/format";
import { paths } from "@/layout/navigation";
import CheckoutModal from "@/pages/workshop/CheckoutModal";
import OrderItemsCard from "@/pages/workshop/OrderItemsCard";
import { WORKSHOP_STATUS_SEQUENCE, formatDateTime } from "@/pages/workshop/workshopStatus";

export default function OrderDetail({ orderId, onBack }: { orderId: number; onBack: () => void }) {
  const navigate = useNavigate();
  const { data: order, loading, error, refetch } = useApiQuery(`workshop/${orderId}`, () => workshopApi.get(orderId));
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [advancing, setAdvancing] = useState(false);
  const [paidSale, setPaidSale] = useState<SaleDetail | null>(null);

  if (loading) return <div className="muted">Cargando orden...</div>;
  if (!order) {
    return (
      <div className="screen-stack">
        <div className="cf-warning">{error?.message ?? "No se encontró la orden"}</div>
        <div><Button variant="secondary" onClick={onBack}>Volver a Taller</Button></div>
      </div>
    );
  }

  const statusIndex = WORKSHOP_STATUS_SEQUENCE.indexOf(order.status);
  const nextStatus = nextWorkshopStatus(order.status);
  const isDelivered = order.status === "Entregada";
  const needsItems = nextStatus === "Lista para entregar" && order.itemsCount === 0;

  const handleAdvance = async () => {
    if (!nextStatus) return;
    if (nextStatus === "Entregada") {
      setIsCheckoutOpen(true);
      return;
    }
    setActionError(null);
    setAdvancing(true);
    try {
      await workshopApi.changeStatus(order.id, nextStatus);
      await refetch();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "No se pudo cambiar el estado");
    } finally {
      setAdvancing(false);
    }
  };

  const handleCheckout = async (input: WorkshopCheckoutInput) => {
    const result = await workshopApi.checkout(order.id, input);
    setPaidSale(result.sale);
    await refetch();
  };

  const advanceLabel =
    nextStatus === "Entregada" ? "Cobrar y entregar" : nextStatus === "Lista para entregar" ? "Marcar lista para entregar" : `Pasar a: ${nextStatus}`;

  return (
    <div className="screen-stack">
      <div className="hero-row">
        <div className="order-back">
          <button type="button" className="back-btn" onClick={onBack} aria-label="Volver a Taller">
            <Icon name="chevron" size="sm" />
          </button>
          <div>
            <div className="section-title">{formatOrderNumber(order.id)}</div>
            <div className="muted">
              {order.clientName} · {order.motorcycle}
              {order.plate ? ` · ${order.plate}` : ""}
            </div>
          </div>
        </div>
        <div className="row-actions">
          {nextStatus && (
            <Button icon="check" onClick={handleAdvance} disabled={advancing || needsItems}>
              {advancing ? "Guardando..." : advanceLabel}
            </Button>
          )}
        </div>
      </div>

      {needsItems && (
        <div className="info-banner">
          <Icon name="wrench" />
          <div>
            <strong>Falta registrar lo que se hizo</strong>
            <span>Agrega al menos un servicio o repuesto para poder marcar la orden como lista para entregar.</span>
          </div>
        </div>
      )}
      {actionError && <div className="cf-warning">{actionError}</div>}
      {paidSale && (
        <div className="success-banner">
          <Icon name="check" />
          <div>
            <strong>Orden cobrada y entregada</strong>
            <span>Se registró la venta #{paidSale.id} por {formatQuetzales(paidSale.total)} ({paidSale.paymentMethod}).</span>
          </div>
          <Button variant="secondary" onClick={() => navigate(paths.salesHistory)}>Ver en historial</Button>
        </div>
      )}

      <div className="step-indicator">
        {WORKSHOP_STATUS_SEQUENCE.map((statusName, idx) => (
          <div key={statusName} className={`step ${idx <= statusIndex ? "done" : ""} ${idx === statusIndex ? "current" : ""}`}>
            <div className="step-dot">{idx < statusIndex || isDelivered ? <Icon name="check" size="sm" /> : <span>{idx + 1}</span>}</div>
            <div className="step-label">{statusName}</div>
            {idx < WORKSHOP_STATUS_SEQUENCE.length - 1 && <div className="step-line" />}
          </div>
        ))}
      </div>

      <div className="order-grid">
        <Card className="form-card">
          <div className="card-title" style={{ marginBottom: 16 }}>Detalles de la orden</div>
          <div className="order-detail-rows">
            <div><span>Cliente</span><strong>{order.clientName}</strong></div>
            <div><span>Teléfono</span><strong>{order.clientPhone ?? "—"}</strong></div>
            <div><span>Motocicleta</span><strong>{order.motorcycle}</strong></div>
            <div><span>Placa</span><strong>{order.plate ?? "—"}</strong></div>
            <div><span>Trabajo solicitado</span><strong>{order.workDescription}</strong></div>
            <div><span>Mecánico</span><strong>{order.mechanicName}</strong></div>
            <div><span>Recibida</span><strong>{formatDateTime(order.receivedAt)}</strong></div>
            <div><span>Costo estimado</span><strong>{order.estimatedCost === null ? "—" : formatQuetzales(order.estimatedCost)}</strong></div>
            {isDelivered ? (
              <div>
                <span>Cobrado</span>
                <strong>
                  {formatQuetzales(order.finalCost ?? order.itemsTotal)} <span className="cost-type">(venta #{order.saleId})</span>
                </strong>
              </div>
            ) : (
              <div><span>Total actual</span><strong>{formatQuetzales(order.itemsTotal)}</strong></div>
            )}
          </div>
        </Card>
        <Card>
          <div className="card-title" style={{ marginBottom: 16 }}>Bitácora</div>
          <div className="order-log">
            {order.events.map((event) => (
              <div key={event.id} className="log-entry">
                <div className="log-dot" />
                <div>
                  <strong>
                    {formatDateTime(event.createdAt)}
                    {event.createdByRole ? ` · ${event.createdByRole}` : ""}
                  </strong>
                  <span>{event.description}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <OrderItemsCard
        items={order.items}
        total={order.itemsTotal}
        editable={!isDelivered}
        onAdd={async (input) => {
          await workshopApi.addItem(order.id, input);
          await refetch();
        }}
        onRemove={async (item) => {
          await workshopApi.removeItem(order.id, item.id);
          await refetch();
        }}
      />

      {isCheckoutOpen && <CheckoutModal order={order} onClose={() => setIsCheckoutOpen(false)} onConfirm={handleCheckout} />}
    </div>
  );
}
