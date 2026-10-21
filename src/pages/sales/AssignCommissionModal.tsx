import { useState } from "react";
import { Modal, TextInput } from "@/components/ui";
import { formatQuetzales } from "@/lib/format";

export default function AssignCommissionModal({
  open,
  saleProduct,
  saleAmount,
  onClose,
  onConfirm,
}: {
  open: boolean;
  saleProduct: string;
  saleAmount: number;
  onClose: () => void;
  onConfirm: (pct: string) => void;
}) {
  const [commissionPct, setCommissionPct] = useState("4.0");
  const calculated = isNaN(parseFloat(commissionPct)) ? 0 : (saleAmount * parseFloat(commissionPct)) / 100;

  return (
    <Modal open={open} title="Asignar comisión" onClose={onClose} onConfirm={() => onConfirm(commissionPct)} confirmLabel="Guardar comisión">
      <div className="muted small" style={{ marginBottom: 14 }}>
        {saleProduct} · {formatQuetzales(saleAmount)}
      </div>
      <TextInput label="Porcentaje de comisión (%)" value={commissionPct} onChange={setCommissionPct} />
      <div className="commission-calc" style={{ marginTop: 12 }}>
        <span>Comisión calculada</span>
        <strong>{formatQuetzales(calculated)}</strong>
      </div>
    </Modal>
  );
}
