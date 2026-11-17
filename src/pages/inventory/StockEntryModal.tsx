import { useState } from "react";
import { stockEntrySchema, type Product } from "@shared/schemas/inventory";
import { ApiError } from "@/api/client";
import { inventoryApi } from "@/api/inventory";
import { Button, FormError, IconButton, Modal, TextInput } from "@/components/ui";
import { formatQuetzales } from "@/lib/format";
import { issuesToErrors } from "@/lib/validation";
import { toAmount, toCount } from "./inventoryFormat";

type UnitRow = { key: number; serial: string; engineNumber: string };
const emptyRow = (): UnitRow => ({ key: Date.now() + Math.random(), serial: "", engineNumber: "" });

/** Entrada de mercadería: por cantidad, o una fila por moto con su chasis. */
export default function StockEntryModal({ product, onClose, onSaved }: { product: Product; onClose: () => void; onSaved: () => void }) {
  const [quantity, setQuantity] = useState("");
  const [rows, setRows] = useState<UnitRow[]>([emptyRow()]);
  const [unitCost, setUnitCost] = useState(product.cost != null ? String(product.cost) : "");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const updateRow = (key: number, field: "serial" | "engineNumber", value: string) =>
    setRows(rows.map((row) => (row.key === key ? { ...row, [field]: value.toUpperCase().replace(/\s/g, "") } : row)));

  const handleSave = async () => {
    const filled = rows.filter((row) => row.serial.trim() !== "" || row.engineNumber.trim() !== "");
    const parsed = stockEntrySchema.safeParse({
      ...(product.tracksUnits
        ? { units: filled.map((row) => ({ serial: row.serial, engineNumber: row.engineNumber || undefined })) }
        : { quantity: toCount(quantity) ?? (quantity.trim() === "" ? undefined : -1) }),
      unitCost: unitCost.trim() === "" ? undefined : toAmount(unitCost),
      note,
    });
    if (!parsed.success) {
      setErrors(issuesToErrors(parsed.error.issues));
      return;
    }
    setSaving(true);
    setErrors({});
    try {
      await inventoryApi.addEntry(product.id, parsed.data);
      onSaved();
    } catch (err) {
      setErrors(err instanceof ApiError ? { ...err.fields, _form: err.message } : { _form: "No se pudo registrar la entrada" });
    } finally {
      setSaving(false);
    }
  };

  const count = product.tracksUnits ? rows.filter((row) => row.serial.trim()).length : toCount(quantity) ?? 0;
  const cost = toAmount(unitCost);

  return (
    <Modal
      open
      wide={product.tracksUnits}
      title={`Entrada de mercadería · ${product.name}`}
      onClose={onClose}
      onConfirm={handleSave}
      confirmLabel={saving ? "Guardando..." : "Registrar entrada"}
      confirmDisabled={saving || count === 0}
    >
      <div className="vertical-form" style={{ marginTop: 0 }}>
        {errors._form && <FormError message={errors._form} />}
        <div className="muted small">
          Existencia actual: <strong>{product.stock}</strong>
          {count > 0 && (
            <>
              {" "}· después de la entrada: <strong>{product.stock + count}</strong>
            </>
          )}
        </div>

        {product.tracksUnits ? (
          <div className="field">
            <span className="field-label">Unidades que entran (una fila por moto)</span>
            <div className="unit-rows">
              {rows.map((row, index) => (
                <div className="unit-row" key={row.key}>
                  <span className="unit-row-number">{index + 1}</span>
                  <TextInput placeholder="Número de chasis" value={row.serial} onChange={(value) => updateRow(row.key, "serial", value)} error={errors[`units.${index}.serial`]} />
                  <TextInput placeholder="Número de motor (opcional)" value={row.engineNumber} onChange={(value) => updateRow(row.key, "engineNumber", value)} error={errors[`units.${index}.engineNumber`]} />
                  <IconButton icon="trash" label="Quitar fila" onClick={() => setRows(rows.length > 1 ? rows.filter((r) => r.key !== row.key) : [emptyRow()])} />
                </div>
              ))}
            </div>
            {errors.units && <span className="field-error">{errors.units}</span>}
            <Button variant="secondary" icon="plus" onClick={() => setRows([...rows, emptyRow()])} disabled={rows.length >= 50}>
              Agregar otra moto
            </Button>
          </div>
        ) : (
          <TextInput label="Cantidad que entra" placeholder="Ej. 10" value={quantity} onChange={setQuantity} error={errors.quantity} />
        )}

        <div className="form-grid two">
          <TextInput label="Costo por unidad (opcional)" placeholder="Q 0.00" value={unitCost} onChange={setUnitCost} error={errors.unitCost} />
          <TextInput label="Nota (opcional)" placeholder="Ej. Factura del proveedor 1234" value={note} onChange={setNote} error={errors.note} />
        </div>
        {cost !== undefined && count > 0 && (
          <div className="notice">
            Total de la compra: {formatQuetzales(cost * count)}. El costo del producto queda como el de esta compra.
          </div>
        )}
      </div>
    </Modal>
  );
}
