import { useState } from "react";
import type { StaffType } from "@shared/constants";
import type { StaffInput, StaffMember } from "@shared/schemas/staff";
import { ApiError } from "@/api/client";
import { staffApi } from "@/api/staff";
import Segmented from "@/components/Segmented";
import { Badge, Button, Card, Icon, IconButton } from "@/components/ui";
import { useApiQuery } from "@/hooks/useApiQuery";
import StaffFormModal from "./StaffFormModal";

const TYPE_FILTERS: Record<string, StaffType | undefined> = { Todos: undefined, Vendedores: "Vendedor", Mecánicos: "Mecánico" };
const STATUS_FILTERS: Record<string, boolean | undefined> = { Activos: true, Inactivos: false, Todos: undefined };

const initialsOf = (fullName: string) =>
  fullName
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

// Módulo de referencia: así se conecta una pantalla a la API.
// - useApiQuery carga y recarga sola (los cambios de la otra estación aparecen en ≤10 s)
// - las acciones llaman a staffApi y luego refetch() para ver el cambio de inmediato
export default function StaffPage() {
  const [typeFilter, setTypeFilter] = useState("Todos");
  const [statusFilter, setStatusFilter] = useState("Activos");
  // undefined = modal cerrado; null = agregar; StaffMember = editar
  const [editing, setEditing] = useState<StaffMember | null>();
  const [actionError, setActionError] = useState<string | null>(null);

  const filters = { type: TYPE_FILTERS[typeFilter], active: STATUS_FILTERS[statusFilter] };
  const { data: staff = [], loading, error, refetch } = useApiQuery(`staff:${typeFilter}:${statusFilter}`, () => staffApi.list(filters));

  const handleSave = async (input: StaffInput) => {
    if (editing) await staffApi.update(editing.id, input);
    else await staffApi.create(input);
    await refetch();
  };

  const handleToggleActive = async (member: StaffMember) => {
    setActionError(null);
    try {
      await staffApi.setActive(member.id, !member.isActive);
      await refetch();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "No se pudo actualizar");
    }
  };

  return (
    <div className="screen-stack">
      <div className="hero-row">
        <div>
          <div className="section-title">Personal</div>
          <div className="muted">Administra las personas asignadas a ventas y órdenes de taller.</div>
        </div>
        <Button icon="plus" onClick={() => setEditing(null)}>
          Agregar persona
        </Button>
      </div>

      <div className="info-banner">
        <Icon name="users" />
        <div>
          <strong>Sin cuentas de acceso</strong>
          <span>El personal no tiene cuentas de acceso al sistema. Los vendedores se asignan a ventas y los mecánicos a órdenes de taller.</span>
        </div>
      </div>

      <div className="personal-filters">
        <Segmented options={Object.keys(TYPE_FILTERS)} value={typeFilter} onChange={setTypeFilter} />
        <Segmented options={Object.keys(STATUS_FILTERS)} value={statusFilter} onChange={setStatusFilter} />
      </div>

      {(error || actionError) && <div className="cf-warning">{actionError ?? error?.message}</div>}

      {!loading && staff.length === 0 && !error && (
        <Card>
          <div className="empty-state-box">
            <div className="empty-state-icon">
              <Icon name="users" />
            </div>
            <div className="empty-state-title">No hay personas con estos filtros</div>
            <div className="empty-state-desc">Agrega vendedores y mecánicos para poder asignarlos a ventas y órdenes de taller.</div>
          </div>
        </Card>
      )}

      <div className="seller-grid">
        {staff.map((member) => (
          <Card className="seller-card" key={member.id}>
            <div className={`seller-avatar ${member.type === "Mecánico" ? "mech" : ""}`}>{initialsOf(member.fullName)}</div>
            <div className="seller-info">
              <strong>{member.fullName}</strong>
              <span>{member.phone ?? "Sin teléfono"}</span>
              <Badge tone={member.type === "Vendedor" ? "info" : "neutral"}>{member.type}</Badge>
            </div>
            <div className="seller-right">
              <button
                type="button"
                className={`person-toggle ${member.isActive ? "on" : ""}`}
                onClick={() => handleToggleActive(member)}
                title={member.isActive ? "Activo — click para desactivar" : "Inactivo — click para activar"}
              >
                <span />
                <span className="toggle-label">{member.isActive ? "Activo" : "Inactivo"}</span>
              </button>
              <IconButton icon="edit" label="Editar" onClick={() => setEditing(member)} />
            </div>
          </Card>
        ))}
      </div>

      {editing !== undefined && <StaffFormModal member={editing} onClose={() => setEditing(undefined)} onSave={handleSave} />}
    </div>
  );
}
