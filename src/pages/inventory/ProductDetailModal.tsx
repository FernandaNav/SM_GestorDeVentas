import { useState } from "react";
import { entryCorrectionSchema, MOVEMENT_LABELS, unitUpdateSchema, type InventoryMovement, type ProductUnit } from "@shared/schemas/inventory";
import { ApiError } from "@/api/client";
import { type ExpenseCorrection, inventoryApi } from "@/api/inventory";
import Pagination from "@/components/Pagination";
import { Badge, Button, FormError, IconButton, Modal, TextInput } from "@/components/ui";
import { useApiQuery } from "@/hooks/useApiQuery";
import { formatQuetzales } from "@/lib/format";
import { issuesToErrors } from "@/lib/validation";
import { MOVEMENT_DATE_FORMAT, toAmount, toCount } from "./inventoryFormat";

/** Qué pasó con el gasto, en palabras, para el aviso después de corregir. */
function expenseMessage(expense: ExpenseCorrection): string {
  switch (expense.status) {
    case "actualizado":
      return ` El gasto en Gastos quedó en ${formatQuetzales(expense.amount)}.`;
    case "eliminado":
      return " Su gasto se eliminó de Gastos.";
    case "no_encontrado":
      return " Su gasto ya no existía en Gastos, así que no se tocó.";
    default:
      return "";
  }
}

const UNIT_TONE = { disponible: "success", vendida: "neutral", baja: "danger" } as const;
const UNIT_LABEL = { disponible: "Disponible", vendida: "Vendida", baja: "De baja" } as const;

/** Detalle de un producto: sus motos (si se controla por unidad) y el kárdex de movimientos. */
export default function ProductDetailModal({ productId, isAdmin, onClose, onChanged }: { productId: number; isAdmin: boolean; onClose: () => void; onChanged: () => void }) {
  const [page, setPage] = useState(1);
  const detail = useApiQuery(`inventory:product:${productId}`, () => inventoryApi.get(productId), { poll: false });
  const movements = useApiQuery(`inventory:movements:${productId}:${page}`, () => (isAdmin ? inventoryApi.movements(productId, page) : Promise.resolve(null)), { poll: false });

  const [editing, setEditing] = useState<ProductUnit | null>(null);
  const [serial, setSerial] = useState("");
  const [engineNumber, setEngineNumber] = useState("");
  const [retiring, setRetiring] = useState<ProductUnit | null>(null);
  const [reason, setReason] = useState("");
  // La moto nunca llegó: además de darla de baja, su costo sale del gasto de la entrada
  const [wasError, setWasError] = useState(false);
  // Corregir una entrada mal registrada (cantidad y costo)
  const [correcting, setCorrecting] = useState<InventoryMovement | null>(null);
  const [fixQuantity, setFixQuantity] = useState("");
  const [fixCost, setFixCost] = useState("");
  const [fixReason, setFixReason] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const product = detail.data;
  const refresh = async () => {
    await Promise.all([detail.refetch(), movements.refetch()]);
    onChanged();
  };

  const startEdit = (unit: ProductUnit) => {
    setRetiring(null);
    setEditing(unit);
    setSerial(unit.serial);
    setEngineNumber(unit.engineNumber ?? "");
    setErrors({});
  };

  const saveUnit = async () => {
    if (!editing) return;
    const parsed = unitUpdateSchema.safeParse({ serial, engineNumber: engineNumber.trim() === "" ? null : engineNumber });
    if (!parsed.success) {
      setErrors(issuesToErrors(parsed.error.issues));
      return;
    }
    setBusy(true);
    try {
      await inventoryApi.updateUnit(editing.id, parsed.data);
      setEditing(null);
      await refresh();
    } catch (err) {
      setErrors({ _form: err instanceof ApiError ? err.message : "No se pudo guardar" });
    } finally {
      setBusy(false);
    }
  };

  const retire = async () => {
    if (!retiring) return;
    if (reason.trim().length < 3) {
      setErrors({ reason: "Explica el motivo de la baja" });
      return;
    }
    setBusy(true);
    try {
      const done = await inventoryApi.retireUnit(retiring.id, reason.trim(), wasError);
      setResult(`Se dio de baja el chasis ${retiring.serial}.${wasError ? expenseMessage(done.expense) : ""}`);
      setWasError(false);
      setRetiring(null);
      setReason("");
      await refresh();
    } catch (err) {
      setErrors({ _form: err instanceof ApiError ? err.message : "No se pudo dar de baja" });
    } finally {
      setBusy(false);
    }
  };

  const startCorrection = (movement: InventoryMovement) => {
    setEditing(null);
    setRetiring(null);
    setResult(null);
    setCorrecting(movement);
    setFixQuantity(String(movement.effectiveQuantity ?? movement.quantity));
    setFixCost(movement.effectiveUnitCost != null ? String(movement.effectiveUnitCost) : "");
    setFixReason("");
    setErrors({});
  };

  const saveCorrection = async () => {
    if (!correcting) return;
    const parsed = entryCorrectionSchema.safeParse({
      quantity: toCount(fixQuantity) ?? (fixQuantity.trim() === "" ? undefined : -1),
      unitCost: fixCost.trim() === "" ? undefined : toAmount(fixCost),
      reason: fixReason,
    });
    if (!parsed.success) {
      setErrors(issuesToErrors(parsed.error.issues));
      return;
    }
    setBusy(true);
    try {
      const done = await inventoryApi.correctEntry(correcting.id, parsed.data);
      setCorrecting(null);
      setResult(`Entrada corregida a ${parsed.data.quantity}.${expenseMessage(done.expense)}`);
      await refresh();
    } catch (err) {
      setErrors({ _form: err instanceof ApiError ? err.message : "No se pudo corregir la entrada" });
    } finally {
      setBusy(false);
    }
  };

  // Vista previa de la corrección: cuánto cambian las existencias y el gasto
  const fixCount = toCount(fixQuantity);
  const fixDelta = correcting && fixCount !== undefined ? fixCount - (correcting.effectiveQuantity ?? correcting.quantity) : null;
  const canCorrect = isAdmin && product && !product.tracksUnits;

  return (
    <Modal open wide title={product ? product.name : "Producto"} onClose={onClose} onConfirm={onClose} confirmLabel="Cerrar" hideCancel>
      {detail.error && <FormError message={detail.error.message} />}
      {product && (
        <div className="screen-stack">
          <div className="confirm-box">
            <div>
              <span>Categoría</span>
              <strong>{product.categoryName}</strong>
            </div>
            <div>
              <span>Precio de venta</span>
              <strong>{formatQuetzales(product.salePrice)}</strong>
            </div>
            {isAdmin && (
              <div>
                <span>Costo</span>
                <strong>{product.cost != null ? formatQuetzales(product.cost) : "Sin registrar"}</strong>
              </div>
            )}
            <div>
              <span>Existencias</span>
              <strong>
                {product.stock} {product.isLow && <Badge tone="warning">Bajas</Badge>}
              </strong>
            </div>
          </div>

          {errors._form && <FormError message={errors._form} />}
          {result && (
            <div className="cf-warning inventory-notice" role="status">
              <span>{result}</span>
              <button type="button" className="icon-button" onClick={() => setResult(null)} aria-label="Cerrar aviso">×</button>
            </div>
          )}

          {product.tracksUnits && (
            <div>
              <div className="card-title">Unidades</div>
              <div className="muted small">{isAdmin ? "Cada moto con su número de chasis." : "Motos disponibles para vender."}</div>
              {product.units.length === 0 ? (
                <div className="muted small" style={{ marginTop: 12 }}>Todavía no hay unidades registradas. Usa “Entrada” para agregarlas.</div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Chasis</th>
                        <th>Motor</th>
                        <th>Estado</th>
                        {isAdmin && <th>Acciones</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {product.units.map((unit) =>
                        editing?.id === unit.id ? (
                          <tr key={unit.id}>
                            <td>
                              <TextInput value={serial} onChange={(v) => setSerial(v.toUpperCase().replace(/\s/g, ""))} error={errors.serial} />
                            </td>
                            <td>
                              <TextInput value={engineNumber} placeholder="Opcional" onChange={(v) => setEngineNumber(v.toUpperCase().replace(/\s/g, ""))} error={errors.engineNumber} />
                            </td>
                            <td colSpan={2}>
                              <div className="row-actions">
                                <Button onClick={saveUnit} disabled={busy}>Guardar</Button>
                                <Button variant="secondary" onClick={() => setEditing(null)} disabled={busy}>Cancelar</Button>
                              </div>
                            </td>
                          </tr>
                        ) : (
                          <tr key={unit.id}>
                            <td><strong>{unit.serial}</strong></td>
                            <td>{unit.engineNumber ?? "—"}</td>
                            <td><Badge tone={UNIT_TONE[unit.status]}>{UNIT_LABEL[unit.status]}</Badge></td>
                            {isAdmin && (
                              <td>
                                {unit.status === "disponible" && (
                                  <div className="row-actions">
                                    <IconButton icon="edit" label="Corregir chasis o motor" onClick={() => startEdit(unit)} />
                                    <IconButton icon="trash" label="Dar de baja" onClick={() => { setEditing(null); setRetiring(unit); setReason(""); setErrors({}); }} />
                                  </div>
                                )}
                              </td>
                            )}
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                </div>
              )}
              {retiring && (
                <div className="retire-box">
                  <TextInput label={`Motivo de la baja del chasis ${retiring.serial}`} placeholder="Ej. Llegó dañada y se devolvió al proveedor" value={reason} onChange={setReason} error={errors.reason} />
                  <label className="filter-check">
                    <input type="checkbox" checked={wasError} onChange={(e) => setWasError(e.target.checked)} />
                    <span>Fue un error de registro (esta moto nunca llegó): quitar su costo del gasto de la entrada</span>
                  </label>
                  <div className="row-actions">
                    <Button variant="danger" onClick={retire} disabled={busy}>Dar de baja</Button>
                    <Button variant="secondary" onClick={() => setRetiring(null)} disabled={busy}>Cancelar</Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {isAdmin && (
            <div>
              <div className="card-title">Kárdex</div>
              <div className="muted small">Todo lo que entró y salió. No se edita ni se borra: una entrada mal registrada se corrige con el lápiz, y lo demás con un ajuste por conteo.</div>
              {movements.data && movements.data.items.length === 0 ? (
                <div className="muted small" style={{ marginTop: 12 }}>Sin movimientos todavía.</div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Movimiento</th>
                        <th>Cantidad</th>
                        <th>Queda</th>
                        <th>Detalle</th>
                        {canCorrect && <th />}
                      </tr>
                    </thead>
                    <tbody>
                      {movements.data?.items.map((m) => (
                        <tr key={m.id}>
                          <td style={{ whiteSpace: "nowrap" }}>{MOVEMENT_DATE_FORMAT.format(new Date(m.createdAt))}</td>
                          <td><Badge tone={m.quantity > 0 ? "success" : "neutral"}>{MOVEMENT_LABELS[m.kind]}</Badge></td>
                          <td style={{ whiteSpace: "nowrap" }}>
                            <strong style={{ color: m.quantity > 0 ? "var(--color-success)" : m.quantity < 0 ? "var(--color-danger)" : undefined }}>
                              {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                            </strong>
                            {m.kind === "entrada" && m.effectiveQuantity !== null && m.effectiveQuantity !== m.quantity && (
                              <div className="muted small">corregida a {m.effectiveQuantity}</div>
                            )}
                          </td>
                          <td>{m.stockAfter}</td>
                          <td className="cell-fill" title={m.note ?? undefined}>
                            {[
                              m.unitSerial && `Chasis ${m.unitSerial}`,
                              m.saleId && `Venta #${m.saleId}`,
                              m.workshopOrderId && `Orden OT-${String(m.workshopOrderId).padStart(4, "0")}`,
                              m.unitCost != null && `Costo ${formatQuetzales(m.unitCost)}`,
                              m.note,
                            ].filter(Boolean).join(" · ") || "—"}
                          </td>
                          {canCorrect && (
                            <td>
                              {m.kind === "entrada" && (
                                <IconButton icon="edit" label="Corregir esta entrada" onClick={() => startCorrection(m)} />
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {correcting && (
                <div className="retire-box correct-box">
                  <div>
                    <strong>Corregir la entrada del {MOVEMENT_DATE_FORMAT.format(new Date(correcting.createdAt))}</strong>
                    <div className="muted small">
                      Hoy dice {correcting.effectiveQuantity ?? correcting.quantity}
                      {correcting.effectiveUnitCost != null && ` a ${formatQuetzales(correcting.effectiveUnitCost)} c/u`}. Escribe lo que debió ser.
                    </div>
                  </div>
                  <div className="form-grid two">
                    <TextInput label="Cantidad correcta" value={fixQuantity} onChange={setFixQuantity} error={errors.quantity} />
                    <TextInput label="Costo por unidad correcto" placeholder="Opcional" value={fixCost} onChange={setFixCost} error={errors.unitCost} />
                  </div>
                  <TextInput label="Motivo" placeholder="Ej. Se escribió 40 en vez de 4" value={fixReason} onChange={setFixReason} error={errors.reason} />
                  {fixDelta !== null && fixDelta !== 0 && (
                    <div className="muted small">
                      Las existencias {fixDelta > 0 ? `suben ${fixDelta}` : `bajan ${-fixDelta}`}. Si la entrada se registró como gasto, el gasto se corrige solo.
                    </div>
                  )}
                  <div className="row-actions">
                    <Button onClick={saveCorrection} disabled={busy}>Guardar corrección</Button>
                    <Button variant="secondary" onClick={() => setCorrecting(null)} disabled={busy}>Cancelar</Button>
                  </div>
                </div>
              )}
              {movements.data && (
                <Pagination
                  page={movements.data.page}
                  pageSize={movements.data.pageSize}
                  totalItems={movements.data.totalItems}
                  totalPages={movements.data.totalPages}
                  onPageChange={setPage}
                  noun="movimientos"
                />
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
