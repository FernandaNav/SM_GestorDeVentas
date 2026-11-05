import { useState } from "react";
import type { StaffType } from "@shared/constants";
import type { StaffInput, StaffMember } from "@shared/schemas/staff";
import { ApiError } from "@/api/client";
import { staffApi } from "@/api/staff";
import Segmented from "@/components/Segmented";
import { Button, Card, Icon } from "@/components/ui";
import { useApiQuery } from "@/hooks/useApiQuery";
import { formatPhone } from "@/lib/phone";
import StaffFormModal from "./StaffFormModal";

const TYPE_FILTERS: Record<string, StaffType | undefined> = { Todos: undefined, Vendedores: "Vendedor", Mecánicos: "Mecánico" };
const STATUS_FILTERS: Record<string, boolean | undefined> = { Todos: undefined, Activos: true, Inactivos: false };

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

      {/* Dos grupos separados y con título, para que no se confundan los dos "Todos" */}
      <div className="personal-filters">
        <div className="filter-group" role="group" aria-label="Tipo de personal">
          <span className="field-label">Tipo de personal</span>
          <Segmented options={Object.keys(TYPE_FILTERS)} value={typeFilter} onChange={setTypeFilter} />
        </div>
        <div className="filter-group" role="group" aria-label="Estado">
          <span className="field-label">Estado</span>
          <Segmented options={Object.keys(STATUS_FILTERS)} value={statusFilter} onChange={setStatusFilter} />
        </div>
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

      <div className="staff-grid">
        {staff.map((member) => {
          const roleClass = member.type === "Mecánico" ? "is-mechanic" : "is-seller";
          return (
            <Card className={`staff-card ${member.isActive ? "" : "is-inactive"}`} key={member.id}>
              <div className="staff-card-main">
                <div className={`staff-avatar ${roleClass}`}>{initialsOf(member.fullName)}</div>
                <div className="staff-identity">
                  <strong title={member.fullName}>{member.fullName}</strong>
                  <span className={`staff-role ${roleClass}`}>{member.type}</span>
                </div>
                <button
                  type="button"
                  className={`person-toggle ${member.isActive ? "on" : ""}`}
                  onClick={() => handleToggleActive(member)}
                  title={member.isActive ? "Activo: haz clic para desactivar" : "Inactivo: haz clic para activar"}
                >
                  <span />
                  <span className="toggle-label">{member.isActive ? "Activo" : "Inactivo"}</span>
                </button>
              </div>
              <div className="staff-card-footer">
                <div className={`staff-phone ${member.phone ? "" : "is-empty"}`}>
                  <Icon name="phone" size="sm" />
                  <span>{member.phone ? formatPhone(member.phone) : "Sin teléfono"}</span>
                </div>
                <Button variant="secondary" icon="edit" onClick={() => setEditing(member)}>
                  Editar
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      {editing !== undefined && <StaffFormModal member={editing} onClose={() => setEditing(undefined)} onSave={handleSave} />}
    </div>
  );
}
