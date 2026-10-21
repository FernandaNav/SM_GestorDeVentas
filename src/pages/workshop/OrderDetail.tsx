import { useState } from "react";
import Segmented from "@/components/Segmented";
import { Button, Card, Icon, Modal, TextInput, Toggle, UnstyledButton } from "@/components/ui";
import { formatQuetzales } from "@/lib/format";
import { WORKSHOP_STATUS_SEQUENCE } from "@/pages/workshop/workshopStatus";
import type { WorkshopOrder, WorkshopStatus } from "@/temporal/localStore";

export default function OrderDetail({
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
