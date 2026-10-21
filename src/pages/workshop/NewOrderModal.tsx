import { useState } from "react";
import { createWorkshopOrderSchema, type CreateWorkshopOrderInput } from "@shared/schemas/workshop";
import { ApiError } from "@/api/client";
import { useCatalog } from "@/catalog/CatalogContext";
import { Modal, Select, TextArea, TextInput } from "@/components/ui";

type Props = {
  onClose: () => void;
  onSave: (input: CreateWorkshopOrderInput) => Promise<void>;
};

// Mismo patrón que StaffFormModal: valida con el esquema compartido y muestra también
// los errores por campo que devuelva la API.
export default function NewOrderModal({ onClose, onSave }: Props) {
  const { mechanics } = useCatalog();
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [motorcycle, setMotorcycle] = useState("");
  const [plate, setPlate] = useState("");
  const [workDescription, setWorkDescription] = useState("");
  const [mechanicName, setMechanicName] = useState("");
  const [estimatedCost, setEstimatedCost] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const mechanic = mechanics.find((m) => m.fullName === mechanicName) ?? mechanics[0];

  const handleSave = async () => {
    const parsed = createWorkshopOrderSchema.safeParse({
      clientName,
      clientPhone,
      motorcycle,
      plate,
      workDescription,
      mechanicId: mechanic?.id,
      estimatedCost: estimatedCost.trim() ? Number(estimatedCost.replace(/[^0-9.]/g, "")) : null,
    });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((issue) => [issue.path.join("."), issue.message])));
      return;
    }
    setSaving(true);
    try {
      await onSave(parsed.data);
      onClose();
    } catch (error) {
      if (error instanceof ApiError) setErrors({ ...error.fields, _form: error.message });
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title="Registrar servicio de taller"
      onClose={onClose}
      onConfirm={handleSave}
      confirmLabel={saving ? "Guardando..." : "Guardar orden"}
      confirmDisabled={saving}
    >
      <div className="form-grid two">
        <TextInput label="Cliente" placeholder="Nombre completo" value={clientName} onChange={setClientName} error={errors.clientName} />
        <TextInput label="Teléfono (opcional)" placeholder="Ej. 5512-3344" value={clientPhone} onChange={setClientPhone} error={errors.clientPhone} />
        <TextInput label="Motocicleta" placeholder="Ej. Honda CB190R" value={motorcycle} onChange={setMotorcycle} error={errors.motorcycle} />
        <TextInput label="Placa (opcional)" placeholder="Ej. M-482JDM" value={plate} onChange={setPlate} error={errors.plate} />
        <div className="span-two">
          <TextArea label="Trabajo solicitado" placeholder="Describe el servicio requerido" value={workDescription} onChange={setWorkDescription} />
          {errors.workDescription && <span className="field-error">{errors.workDescription}</span>}
        </div>
        <div>
          <Select label="Mecánico" value={mechanic?.fullName ?? ""} options={mechanics.map((m) => m.fullName)} onChange={setMechanicName} />
          {(errors.mechanicId || mechanics.length === 0) && (
            <span className="field-error">{mechanics.length === 0 ? "No hay mecánicos activos; agrégalos en Personal" : errors.mechanicId}</span>
          )}
        </div>
        <TextInput label="Costo estimado (opcional)" placeholder="Q 0.00" value={estimatedCost} onChange={setEstimatedCost} error={errors.estimatedCost} />
      </div>
      {errors._form && <div className="field-error" style={{ marginTop: 12 }}>{errors._form}</div>}
    </Modal>
  );
}
