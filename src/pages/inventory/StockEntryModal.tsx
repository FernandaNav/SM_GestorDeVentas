import { useState } from "react";
import { EXPENSE_AREAS, type ExpenseArea } from "@shared/constants";
import { stockEntrySchema, type Product } from "@shared/schemas/inventory";
import { ApiError } from "@/api/client";
import { inventoryApi } from "@/api/inventory";
import { Button, FormError, IconButton, Modal, TextInput } from "@/components/ui";
import { formatQuetzales } from "@/lib/format";
import { issuesToErrors } from "@/lib/validation";
import Segmented from "@/components/Segmented";
import { toAmount, toCount } from "./inventoryFormat";

type UnitRow = { key: number; serial: string; engineNumber: string };
const emptyRow = (): UnitRow => ({ key: Date.now() + Math.random(), serial: "", engineNumber: "" });

/** Los repuestos y lubricantes suelen ser compras del taller; lo demás, de la tienda. Se puede cambiar. */
const suggestedArea = (categoryName: string): ExpenseArea => (/repuesto|lubric|aceite|taller/i.test(categoryName) ? "Taller" : "Tienda");

/** Entrada de mercadería: por cantidad, o una fila por moto con su chasis. Opcionalmente queda también como gasto. */
export default function StockEntryModal({ product, onClose, onSaved }: { product: Product; onClose: () => void; onSaved: (expenseAmount?: number) => void }) {
  const [quantity, setQuantity] = useState("");
  const [rows, setRows] = useState<UnitRow[]>([emptyRow()]);
  const [unitCost, setUnitCost] = useState(product.cost != null ? String(product.cost) : "");
  const [note, setNote] = useState("");
  // Registrar la compra también en Gastos (marcado por defecto; se desmarca si ya se anotó a mano)
  const [asExpense, setAsExpense] = useState(true);
  const [area, setArea] = useState<ExpenseArea>(() => suggestedArea(product.categoryName));
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
      ...(asExpense && (toAmount(unitCost) ?? 0) > 0 && { expense: { area } }),
    });
    if (!parsed.success) {
      setErrors(issuesToErrors(parsed.error.issues));
      return;
    }
    setSaving(true);
    setErrors({});
    try {
      await inventoryApi.addEntry(product.id, parsed.data);
      onSaved(parsed.data.expense && parsed.data.unitCost ? Math.round(parsed.data.unitCost * count * 100) / 100 : undefined);
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
        {cost !== undefined && cost > 0 && (
          <div className="expense-option">
            <label className="filter-check">
              <input type="checkbox" checked={asExpense} onChange={(e) => setAsExpense(e.target.checked)} />
              <span>Registrar también como gasto (Mercadería)</span>
            </label>
            {asExpense && <Segmented options={[...EXPENSE_AREAS]} value={area} onChange={(value) => setArea(value as ExpenseArea)} />}
            <span className="muted small">
              {asExpense
                ? "Aparece en Gastos y en la comparación de ventas contra gastos. Desmárcalo si esta compra ya la anotaste a mano en Gastos."
                : "No se registrará como gasto: úsalo si ya la anotaste a mano en Gastos."}
            </span>
          </div>
        )}
        {cost !== undefined && count > 0 && (
          <div className="notice">
            Total de la compra: {formatQuetzales(cost * count)}
            {asExpense && cost > 0 ? ` · se registra como gasto de ${area}` : ""}. El costo del producto queda como el de esta compra.
          </div>
        )}
      </div>
    </Modal>
  );
}
