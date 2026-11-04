import { useState } from "react";
import { useSearchParams } from "react-router";
import { formatOrderNumber, type CreateWorkshopOrderInput, type WorkshopOrderSummary } from "@shared/schemas/workshop";
import { workshopApi } from "@/api/workshop";
import { useSessionUser } from "@/auth/AuthContext";
import Pagination from "@/components/Pagination";
import { Badge, Button, Card, Icon, TextInput } from "@/components/ui";
import { useApiQuery } from "@/hooks/useApiQuery";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { formatQuetzales } from "@/lib/format";
import NewOrderModal from "@/pages/workshop/NewOrderModal";
import OrderDetail from "@/pages/workshop/OrderDetail";
import { WORKSHOP_STATUS_TONES } from "@/pages/workshop/workshopStatus";

const HISTORY_PAGE_SIZE = 20;
const SEARCH_DELAY_MS = 300;

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
  // Aquí y no en el historial: al abrir una orden el historial se desmonta y al regresar debe seguir en su página
  const [historyPage, setHistoryPage] = useState(1);
  const isAdmin = useSessionUser().role === "Administrador";

  const handleSearch = (value: string) => {
    setSearchQuery(value);
    setHistoryPage(1);
  };

  const { data: activeOrders = [], loading, error, refetch } = useApiQuery("workshop:activas", workshopApi.listActive);
  const { data: summary, refetch: refetchSummary } = useApiQuery("workshop:summary", workshopApi.summary);

  const selectedId = Number(searchParams.get("orden"));
  if (Number.isInteger(selectedId) && selectedId > 0) {
    return (
      <OrderDetail
        orderId={selectedId}
        onBack={() => {
          setSearchParams({});
          refetch();
          refetchSummary();
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

  const displayedActive = activeOrders.filter((order) => matchesSearch(order, searchQuery));
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
          <strong style={{ color: "var(--color-blue)" }}>{summary?.deliveredToday ?? 0}</strong>
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
              {isAdmin ? "Historial" : "Entregadas hoy"} <span className="tab-count">{summary?.deliveredTotal ?? 0}</span>
            </button>
          </div>
          <TextInput placeholder="Buscar por cliente, moto, placa u orden..." icon="search" value={searchQuery} onChange={handleSearch} />
        </div>

        {activeTab === "activas" ? (
          !loading && displayedActive.length === 0 ? (
            <EmptyOrders
              title={searchQuery ? "Ninguna orden coincide con la búsqueda" : "No hay órdenes activas"}
              text="Haz clic en Nuevo servicio para registrar una nueva orden de trabajo."
            />
          ) : (
            <OrdersTable orders={displayedActive} onOpen={openOrder} />
          )
        ) : (
          <WorkshopHistory search={searchQuery} page={historyPage} onPageChange={setHistoryPage} onOpen={openOrder} isAdmin={isAdmin} />
        )}
      </Card>

      {isNewModalOpen && <NewOrderModal onClose={() => setIsNewModalOpen(false)} onSave={handleCreate} />}
    </div>
  );
}

/**
 * Órdenes entregadas. Se acumulan sin límite, así que van paginadas y la búsqueda la hace
 * el servidor para encontrar también las de otras páginas. Solo consulta mientras se ve.
 */
function WorkshopHistory({
  search,
  page,
  onPageChange,
  onOpen,
  isAdmin,
}: {
  search: string;
  page: number;
  onPageChange: (page: number) => void;
  onOpen: (id: number) => void;
  isAdmin: boolean;
}) {
  const debouncedSearch = useDebouncedValue(search.trim(), SEARCH_DELAY_MS);

  const { data, loading, error } = useApiQuery(`workshop:historial:${debouncedSearch}:${page}`, () =>
    workshopApi.history(page, HISTORY_PAGE_SIZE, debouncedSearch || undefined),
  );
  const orders = data?.items ?? [];

  if (error) return <div className="cf-warning">{error.message}</div>;
  if (loading && orders.length === 0) return <div className="muted" style={{ padding: 16 }}>Cargando historial...</div>;
  if (orders.length === 0) {
    const emptyTitle = isAdmin ? "Todavía no hay órdenes entregadas" : "Hoy todavía no se han entregado órdenes";
    return (
      <EmptyOrders
        title={debouncedSearch ? "Ninguna orden coincide con la búsqueda" : emptyTitle}
        text={isAdmin ? "Aquí aparecen las órdenes ya cobradas y entregadas." : "Aquí aparecen las órdenes cobradas y entregadas hoy."}
      />
    );
  }

  return (
    <>
      <OrdersTable orders={orders} onOpen={onOpen} />
      {data && (
        <Pagination
          page={data.page}
          pageSize={data.pageSize}
          totalItems={data.totalItems}
          totalPages={data.totalPages}
          onPageChange={onPageChange}
          noun="órdenes"
        />
      )}
    </>
  );
}

function OrdersTable({ orders, onOpen }: { orders: WorkshopOrderSummary[]; onOpen: (id: number) => void }) {
  return (
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
          {orders.map((order) => (
            <tr key={order.id} style={{ cursor: "pointer" }} onClick={() => onOpen(order.id)}>
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
  );
}

function EmptyOrders({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty-state-box">
      <div className="empty-state-icon">
        <Icon name="wrench" />
      </div>
      <div className="empty-state-title">{title}</div>
      <div className="empty-state-desc">{text}</div>
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
