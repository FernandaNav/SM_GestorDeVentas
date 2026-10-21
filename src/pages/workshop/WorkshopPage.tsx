import { useState } from "react";
import type { Role } from "@shared/constants";
import { useCatalog } from "@/catalog/CatalogContext";
import { Badge, Button, Card, Icon, Modal, Select, TextArea, TextInput } from "@/components/ui";
import { formatQuetzales } from "@/lib/format";
import OrderDetail from "@/pages/workshop/OrderDetail";
import { WORKSHOP_STATUS_TONES } from "@/pages/workshop/workshopStatus";
import type { WorkshopOrder } from "@/temporal/localStore";

export default function Workshop({
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
  const { mechanicNames } = useCatalog();
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
  const [newMechanic, setNewMechanic] = useState(mechanicNames[0]);
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
            options={mechanicNames}
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
