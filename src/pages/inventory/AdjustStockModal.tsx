import { useState } from "react";
import { stockAdjustmentSchema, type Product } from "@shared/schemas/inventory";
import { ApiError } from "@/api/client";
import { inventoryApi } from "@/api/inventory";
import { FormError, Modal, TextArea, TextInput } from "@/components/ui";
import { issuesToErrors } from "@/lib/validation";
import { toCount } from "./inventoryFormat";

/** Ajuste por conteo físico: se escribe cuántos hay de verdad y el motivo. Queda en el kárdex. */
export default function AdjustStockModal({ product, onClose, onSaved }: { product: Product; onClose: () => void; onSaved: () => void }) {
  const [counted, setCounted] = useState("");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const countedValue = toCount(counted);
  const difference = countedValue === undefined ? null : countedValue - product.stock;

  const handleSave = async () => {
    const parsed = stockAdjustmentSchema.safeParse({ countedStock: countedValue ?? (counted.trim() === "" ? undefined : -1), reason });
    if (!parsed.success) {
      setErrors(issuesToErrors(parsed.error.issues));
      return;
    }
    setSaving(true);
    setErrors({});
    try {
      await inventoryApi.adjust(product.id, parsed.data);
      onSaved();
    } catch (err) {
      setErrors(err instanceof ApiError ? { ...err.fields, _form: err.message } : { _form: "No se pudo ajustar" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title={`Ajustar existencias · ${product.name}`}
      onClose={onClose}
      onConfirm={handleSave}
      confirmLabel={saving ? "Guardando..." : "Guardar ajuste"}
      confirmDisabled={saving || difference === null || difference === 0 || reason.trim().length < 3}
    >
      <div className="vertical-form" style={{ marginTop: 0 }}>
        {errors._form && <FormError message={errors._form} />}
        <div className="confirm-box">
          <div>
            <span>En el sistema</span>
            <strong>{product.stock}</strong>
          </div>
          <div>
            <span>Diferencia</span>
            <strong style={{ color: difference === null || difference === 0 ? undefined : difference > 0 ? "var(--color-success)" : "var(--color-danger)" }}>
              {difference === null ? "—" : difference > 0 ? `+${difference}` : difference}
            </strong>
          </div>
        </div>
        <TextInput label="Existencia contada" placeholder="¿Cuántos hay de verdad?" value={counted} onChange={setCounted} error={errors.countedStock} />
        <TextArea label="Motivo" placeholder="Ej. Conteo físico de fin de mes" value={reason} onChange={setReason} />
        {errors.reason && <span className="field-error">{errors.reason}</span>}
        <div className="notice">El ajuste no borra nada: queda en el kárdex con el motivo y quién lo hizo.</div>
      </div>
    </Modal>
  );
}
