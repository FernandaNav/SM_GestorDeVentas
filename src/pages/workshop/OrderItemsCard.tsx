import { useState } from "react";
import {
  workshopItemInputSchema,
  type WorkshopItemInput,
  type WorkshopItemKind,
  type WorkshopOrderItem,
} from "@shared/schemas/workshop";
import { ApiError } from "@/api/client";
import { useCatalog } from "@/catalog/CatalogContext";
import Segmented from "@/components/Segmented";
import { Badge, Button, Card, Icon } from "@/components/ui";
import { formatQuetzales } from "@/lib/format";

const KIND_LABELS: Record<WorkshopItemKind, string> = { servicio: "Servicio", repuesto: "Repuesto" };
// Categoría sugerida para cada tipo; se puede cambiar antes de agregar
const DEFAULT_CATEGORY: Record<WorkshopItemKind, string> = { servicio: "Servicio de taller", repuesto: "Repuesto" };

type Props = {
  items: WorkshopOrderItem[];
  total: number;
  /** false cuando la orden ya se entregó y cobró */
  editable: boolean;
  onAdd: (input: WorkshopItemInput) => Promise<void>;
  onRemove: (item: WorkshopOrderItem) => Promise<void>;
};

// Servicios y repuestos usados en la orden. Al cobrar se copian a la venta marcando
// qué fue servicio y qué fue repuesto.
export default function OrderItemsCard({ items, total, editable, onAdd, onRemove }: Props) {
  const { categories } = useCatalog();
  const [kind, setKind] = useState<WorkshopItemKind>("servicio");
  const [description, setDescription] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const category =
    categories.find((c) => c.name === categoryName) ?? categories.find((c) => c.name === DEFAULT_CATEGORY[kind]) ?? categories[0];

  const handleKindChange = (label: string) => {
    setKind(label === "Repuesto" ? "repuesto" : "servicio");
    setCategoryName("");
  };

  const handleAdd = async () => {
    const parsed = workshopItemInputSchema.safeParse({
      kind,
      description,
      categoryId: category?.id,
      quantity: Number(quantity),
      unitPrice: unitPrice.trim() ? Number(unitPrice.replace(/[^0-9.]/g, "")) : undefined,
    });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((issue) => [issue.path.join("."), issue.message])));
      return;
    }
    setBusy(true);
    try {
      await onAdd(parsed.data);
      setDescription("");
      setQuantity("1");
      setUnitPrice("");
      setErrors({});
    } catch (error) {
      setErrors(error instanceof ApiError ? { ...error.fields, _form: error.message } : { _form: "No se pudo agregar" });
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (item: WorkshopOrderItem) => {
    setBusy(true);
    try {
      await onRemove(item);
    } catch (error) {
      setErrors({ _form: error instanceof ApiError ? error.message : "No se pudo quitar" });
    } finally {
      setBusy(false);
    }
  };

  const fieldError = errors.description ?? errors.categoryId ?? errors.quantity ?? errors.unitPrice ?? errors.kind ?? errors._form;

  return (
    <Card className="form-card">
      <div className="card-heading">
        <div>
          <div className="card-title">Servicios y repuestos</div>
          <div className="muted small">Lo que se le cobrará al cliente al entregar la moto.</div>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="empty-state-box">
          <div className="empty-state-icon">
            <Icon name="wrench" />
          </div>
          <div className="empty-state-title">Todavía no hay servicios ni repuestos</div>
          <div className="empty-state-desc">Agrégalos abajo conforme el mecánico avance con el trabajo.</div>
        </div>
      ) : (
        <div className="items-table-wrap">
          <table className="items-table">
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Descripción</th>
                <th>Categoría</th>
                <th>Cant.</th>
                <th>Precio unit.</th>
                <th>Subtotal</th>
                {editable && <th />}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td><Badge tone={item.kind === "servicio" ? "info" : "neutral"}>{KIND_LABELS[item.kind]}</Badge></td>
                  <td><strong>{item.description}</strong></td>
                  <td>{item.categoryName ?? "—"}</td>
                  <td>{item.quantity}</td>
                  <td>{formatQuetzales(item.unitPrice)}</td>
                  <td className="cell-amount">{formatQuetzales(item.subtotal)}</td>
                  {editable && (
                    <td>
                      <button type="button" className="icon-button" disabled={busy} onClick={() => handleRemove(item)} aria-label={`Quitar ${item.description}`}>
                        <Icon name="trash" size="sm" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              <tr>
                <td colSpan={5} className="cell-amount">Total</td>
                <td className="cell-amount">{formatQuetzales(total)}</td>
                {editable && <td />}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {editable && (
        <div className="screen-stack" style={{ marginTop: 18 }}>
          <div className="field-label">Agregar</div>
          <Segmented options={["Servicio", "Repuesto"]} value={KIND_LABELS[kind]} onChange={handleKindChange} />
          <div className="items-table-wrap">
            <table className="items-table">
              <thead>
                <tr>
                  <th>Descripción</th>
                  <th>Categoría</th>
                  <th>Cant.</th>
                  <th>Precio unit.</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <input
                      className="cell-input wide"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder={kind === "servicio" ? "Ej. Cambio de aceite" : "Ej. Filtro de aceite"}
                    />
                  </td>
                  <td>
                    <select className="cell-select" value={category?.name ?? ""} onChange={(e) => setCategoryName(e.target.value)}>
                      {categories.map((c) => (
                        <option key={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input className="cell-input narrow" type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
                  </td>
                  <td>
                    <input className="cell-input" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} placeholder="0.00" />
                  </td>
                  <td>
                    <Button icon="plus" variant="secondary" onClick={handleAdd} disabled={busy}>
                      Agregar
                    </Button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          {fieldError && <span className="field-error">{fieldError}</span>}
        </div>
      )}
    </Card>
  );
}
