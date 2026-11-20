import { useState } from "react";
import { satInvoiceSchema, type SatInvoice, type SatInvoiceInput } from "@shared/schemas/sales";
import { ApiError } from "@/api/client";
import { salesApi } from "@/api/sales";
import { FormError, Modal, TextInput } from "@/components/ui";
import { issuesToErrors } from "@/lib/validation";

/**
 * Lee la serie y el número escritos. Los dos vacíos = sin factura todavía (`empty`); uno solo, o
 * con caracteres que no van, = errores por campo con las mismas llaves que manda el servidor.
 */
export function readSatInvoice(series: string, number: string): { value?: SatInvoiceInput; empty: boolean; errors?: Record<string, string> } {
  if (series.trim() === "" && number.trim() === "") return { empty: true };
  const parsed = satInvoiceSchema.safeParse({ series, number });
  if (parsed.success) return { value: parsed.data, empty: false };
  return { empty: false, errors: issuesToErrors(parsed.error.issues.map((issue) => ({ ...issue, path: ["satInvoice", ...issue.path] }))) };
}

/** Campos de la factura emitida en la app de la SAT: serie y número. */
export default function SatInvoiceFields({
  series,
  number,
  onSeries,
  onNumber,
  errors = {},
  hint = "Si ya la emitiste en la app de la SAT, copia aquí su serie y número. Si no, puedes agregarlos después desde el Historial.",
}: {
  series: string;
  number: string;
  onSeries: (value: string) => void;
  onNumber: (value: string) => void;
  errors?: Record<string, string>;
  hint?: string;
}) {
  return (
    <div className="sat-invoice-fields">
      <span className="field-label">Factura de la SAT (opcional)</span>
      <div className="form-grid two">
        <TextInput label="Serie" placeholder="Ej. A1B2C3D4" value={series} onChange={(value) => onSeries(value.toUpperCase().replace(/\s/g, ""))} error={errors["satInvoice.series"]} />
        <TextInput label="Número" placeholder="Ej. 1234567890" value={number} onChange={(value) => onNumber(value.replace(/\D/g, ""))} error={errors["satInvoice.number"]} />
      </div>
      <span className="muted small">{hint}</span>
    </div>
  );
}

/** Desde el Historial: registrar (o, el Administrador, cambiar o quitar) la factura de la SAT de una venta. */
export function SatInvoiceModal({
  saleId,
  current,
  isAdmin,
  onClose,
  onSaved,
}: {
  saleId: number;
  current: SatInvoice | null;
  isAdmin: boolean;
  onClose: () => void;
  onSaved: (invoice: SatInvoice | null) => void;
}) {
  const [series, setSeries] = useState(current?.series ?? "");
  const [number, setNumber] = useState(current?.number ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const read = readSatInvoice(series, number);
    if (read.errors) {
      setErrors(read.errors);
      return;
    }
    // Dejar los dos vacíos quita la factura (solo el Administrador puede)
    if (read.empty && !current) {
      setErrors({ "satInvoice.series": "Escribe la serie", "satInvoice.number": "Escribe el número" });
      return;
    }
    setSaving(true);
    setErrors({});
    try {
      const updated = await salesApi.setSatInvoice(saleId, read.value ?? null);
      onSaved(updated.satInvoice);
    } catch (err) {
      setErrors(err instanceof ApiError ? { ...err.fields, _form: err.message } : { _form: "No se pudo guardar la factura" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title={current ? `Factura SAT de la venta #${saleId}` : `Registrar factura SAT · venta #${saleId}`}
      onClose={onClose}
      onConfirm={save}
      confirmLabel={saving ? "Guardando..." : "Guardar"}
      confirmDisabled={saving}
    >
      <div className="vertical-form" style={{ marginTop: 0 }}>
        {errors._form && <FormError message={errors._form} />}
        <SatInvoiceFields
          series={series}
          number={number}
          onSeries={setSeries}
          onNumber={setNumber}
          errors={errors}
          hint={
            current && isAdmin
              ? "Corrige la serie o el número. Si dejas los dos vacíos, la venta vuelve a quedar con la factura pendiente."
              : "Cópialos de la factura que emitiste en la app de la SAT."
          }
        />
      </div>
    </Modal>
  );
}
