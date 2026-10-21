import { useState } from "react";
import type { StaffType } from "@shared/constants";
import { staffInputSchema, type StaffInput, type StaffMember } from "@shared/schemas/staff";
import { ApiError } from "@/api/client";
import { Modal, TextInput, UnstyledButton } from "@/components/ui";

type Props = {
  /** null = agregar; con valor = editar a esa persona */
  member: StaffMember | null;
  onClose: () => void;
  onSave: (input: StaffInput) => Promise<void>;
};

// Patrón de formulario para los demás módulos: se valida con el mismo esquema zod que
// usa el backend, se muestran los errores por campo y también los que devuelva la API.
export default function StaffFormModal({ member, onClose, onSave }: Props) {
  const [fullName, setFullName] = useState(member?.fullName ?? "");
  const [type, setType] = useState<StaffType>(member?.type ?? "Vendedor");
  const [phone, setPhone] = useState(member?.phone ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const parsed = staffInputSchema.safeParse({ fullName, type, phone });
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
      title={member ? "Editar persona" : "Agregar persona"}
      onClose={onClose}
      onConfirm={handleSave}
      confirmLabel={saving ? "Guardando..." : member ? "Guardar cambios" : "Agregar"}
      confirmDisabled={saving}
    >
      <div className="vertical-form" style={{ marginTop: 0 }}>
        <TextInput label="Nombre completo" placeholder="Ej. Luisa Ajú" value={fullName} onChange={setFullName} error={errors.fullName} />
        <div className="field">
          <span className="field-label">Tipo</span>
          <div className="segmented">
            {(["Vendedor", "Mecánico"] as const).map((option) => (
              <UnstyledButton key={option} className={type === option ? "selected" : ""} onClick={() => setType(option)}>
                <span>{option}</span>
              </UnstyledButton>
            ))}
          </div>
        </div>
        <TextInput label="Teléfono (opcional)" placeholder="Ej. 5512-3344" value={phone} onChange={setPhone} error={errors.phone} />
        {errors._form && <span className="field-error">{errors._form}</span>}
      </div>
    </Modal>
  );
}
