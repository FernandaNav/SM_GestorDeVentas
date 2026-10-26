import { useState } from "react";
import { assignCommissionSchema, commissionFor, type CommissionItem } from "@shared/schemas/commissions";
import { ApiError } from "@/api/client";
import { Modal, TextInput } from "@/components/ui";
import { formatQuetzales } from "@/lib/format";

/** Asignar un mismo porcentaje a uno o varios artículos pendientes (RF 3.1, 3.2). */
export default function AssignPendingModal({
  items,
  onClose,
  onSave,
}: {
  items: CommissionItem[];
  onClose: () => void;
  onSave: (commissionRate: number) => Promise<void>;
}) {
  const [rateText, setRateText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const rate = Number(rateText.replace(",", "."));
  const parsed = assignCommissionSchema.shape.commissionRate.safeParse(rateText.trim() === "" ? undefined : rate);
  const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
  const preview = parsed.success ? items.reduce((sum, item) => sum + commissionFor(item.subtotal, parsed.data), 0) : 0;

  const handleConfirm = async () => {
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(parsed.data);
    } catch (err) {
      setError(err instanceof ApiError ? (Object.values(err.fields)[0] ?? err.message) : "No se pudo guardar");
      setSaving(false);
    }
  };

  const title = items.length === 1 ? "Asignar comisión" : `Asignar comisión a ${items.length} artículos`;

  return (
    <Modal open title={title} onClose={onClose} onConfirm={handleConfirm} confirmLabel={saving ? "Guardando…" : "Guardar comisión"} confirmDisabled={saving}>
      <div className="muted small" style={{ marginBottom: 14 }}>
        {items.length === 1 ? `${items[0].description} · venta #${items[0].saleId} · ${items[0].sellerName}` : `${new Set(items.map((i) => i.saleId)).size} ventas`}
        {" · "}
        {formatQuetzales(subtotal)}
      </div>
      <TextInput
        label="Porcentaje de comisión (%)"
        value={rateText}
        placeholder="Ej. 4"
        onChange={(value) => {
          setRateText(value);
          setError(null);
        }}
        error={error ?? undefined}
      />
      <div className="commission-calc" style={{ marginTop: 12 }}>
        <span>Comisión calculada</span>
        <strong>{formatQuetzales(preview)}</strong>
      </div>
    </Modal>
  );
}
