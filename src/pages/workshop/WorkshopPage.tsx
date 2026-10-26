import { useState } from "react";
import { useSearchParams } from "react-router";
import { formatOrderNumber, type CreateWorkshopOrderInput, type WorkshopOrderSummary } from "@shared/schemas/workshop";
import { workshopApi } from "@/api/workshop";
import { Badge, Button, Card, Icon, TextInput } from "@/components/ui";
import { useApiQuery } from "@/hooks/useApiQuery";
import { formatQuetzales } from "@/lib/format";
import NewOrderModal from "@/pages/workshop/NewOrderModal";
import OrderDetail from "@/pages/workshop/OrderDetail";
import { WORKSHOP_STATUS_TONES } from "@/pages/workshop/workshopStatus";

const GUATEMALA_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guatemala" });
const isToday = (iso: string | null) => !!iso && GUATEMALA_DAY.format(new Date(iso)) === GUATEMALA_DAY.format(new Date());

const matchesSearch = (order: WorkshopOrderSummary, query: string) => {
  const text = query.trim().toLowerCase();
  if (!text) return true;
  return [formatOrderNumber(order.id), order.clientName, order.motorcycle, order.plate ?? "", order.clientPhone ?? ""].some((value) =>
    value.toLowerCase().includes(text),
  );
};

// Taller (RF 8.1): los dos roles registran, avanzan y cobran órdenes. La orden abierta
// va en la URL (?orden=7) para que el inicio del empleado pueda enlazar directo a ella.
export default function WorkshopPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<"activas" | "historial">("activas");
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const { data: activeOrders = [], loading, error, refetch } = useApiQuery("workshop:activas", () => workshopApi.list({ view: "activas" }));
  const { data: historyOrders = [], refetch: refetchHistory } = useApiQuery("workshop:historial", () =>
    workshopApi.list({ view: "historial" }),
  );

  const selectedId = Number(searchParams.get("orden"));
  if (Number.isInteger(selectedId) && selectedId > 0) {
    return (
      <OrderDetail
        orderId={selectedId}
        onBack={() => {
          setSearchParams({});
          refetch();
          refetchHistory();
        }}
      />
    );
  }

  const openOrder = (id: number) => setSearchParams({ orden: String(id) });

  const handleCreate = async (input: CreateWorkshopOrderInput) => {
    const created = await workshopApi.create(input);
    await refetch();
    openOrder(created.id);
  };

  const displayedOrders = (activeTab === "activas" ? activeOrders : historyOrders).filter((order) => matchesSearch(order, searchQuery));
  const countByStatus = (status: WorkshopOrderSummary["status"]) => activeOrders.filter((order) => order.status === status).length;

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
          <strong style={{ color: "var(--color-text)" }}>{countByStatus("Recibida")}</strong>
        </Card>
        <Card>
          <span>En reparación</span>
          <strong style={{ color: "var(--color-warning)" }}>{countByStatus("En reparación")}</strong>
        </Card>
        <Card>
          <span>Listas para entregar</span>
          <strong style={{ color: "var(--color-success)" }}>{countByStatus("Lista para entregar")}</strong>
        </Card>
        <Card>
          <span>Entregadas hoy</span>
          <strong style={{ color: "var(--color-blue)" }}>{historyOrders.filter((order) => isToday(order.deliveredAt)).length}</strong>
        </Card>
      </div>

      {error && <div className="cf-warning">{error.message}</div>}

      <Card>
        <div className="workshop-header">
          <div className="workshop-tabs">
            <button type="button" className={`workshop-tab ${activeTab === "activas" ? "active" : ""}`} onClick={() => setActiveTab("activas")}>
              Órdenes activas <span className="tab-count">{activeOrders.length}</span>
            </button>
            <button type="button" className={`workshop-tab ${activeTab === "historial" ? "active" : ""}`} onClick={() => setActiveTab("historial")}>
              Historial <span className="tab-count">{historyOrders.length}</span>
            </button>
          </div>
          <TextInput placeholder="Buscar por cliente, moto, placa u orden..." icon="search" value={searchQuery} onChange={setSearchQuery} />
        </div>

        {!loading && displayedOrders.length === 0 ? (
          <div className="empty-state-box">
            <div className="empty-state-icon">
              <Icon name="wrench" />
            </div>
            <div className="empty-state-title">{searchQuery ? "Ninguna orden coincide con la búsqueda" : "No hay órdenes en esta sección"}</div>
            <div className="empty-state-desc">
              {activeTab === "activas" ? "Haz clic en Nuevo servicio para registrar una nueva orden de trabajo." : "Aquí aparecen las órdenes ya cobradas y entregadas."}
            </div>
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
                {displayedOrders.map((order) => (
                  <tr key={order.id} style={{ cursor: "pointer" }} onClick={() => openOrder(order.id)}>
                    <td><strong>{formatOrderNumber(order.id)}</strong></td>
                    <td>{order.clientName}</td>
                    <td>{order.clientPhone ?? "—"}</td>
                    <td>{order.plate ? `${order.motorcycle} · ${order.plate}` : order.motorcycle}</td>
                    <td>{order.workDescription}</td>
                    <td>{order.mechanicName}</td>
                    <td><Badge tone={WORKSHOP_STATUS_TONES[order.status]}>{order.status}</Badge></td>
                    <td><OrderCost order={order} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {isNewModalOpen && <NewOrderModal onClose={() => setIsNewModalOpen(false)} onSave={handleCreate} />}
    </div>
  );
}

function OrderCost({ order }: { order: WorkshopOrderSummary }) {
  if (order.status === "Entregada") {
    return (
      <>
        <strong>{formatQuetzales(order.finalCost ?? order.itemsTotal)}</strong> <span className="cost-type">(cobrado)</span>
      </>
    );
  }
  if (order.itemsCount > 0) {
    return (
      <>
        <strong>{formatQuetzales(order.itemsTotal)}</strong> <span className="cost-type">(acumulado)</span>
      </>
    );
  }
  if (order.estimatedCost !== null) {
    return (
      <>
        <strong>{formatQuetzales(order.estimatedCost)}</strong> <span className="cost-type">(estimado)</span>
      </>
    );
  }
  return <span className="muted">—</span>;
}
