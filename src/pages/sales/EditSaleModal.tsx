import { useEffect, useState } from "react";
import type { PaymentMethod } from "@shared/constants";
import type { SaleDetail, SaleItemInput, UpdateSaleInput } from "@shared/schemas/sales";
import { salesApi } from "@/api/sales";
import { useCatalog } from "@/catalog/CatalogContext";
import Segmented from "@/components/Segmented";
import { Button, Icon, Modal, Select, TextArea, TextInput, Toggle, UnstyledButton } from "@/components/ui";
import { formatQuetzales } from "@/lib/format";

type EditableItem = {
  id: number;
  description: string;
  categoryId: number;
  quantity: number;
  unitPrice: number;
  commissionRate: string;
};

export default function EditSaleModal({
  open,
  saleId,
  onClose,
  onSuccess,
}: {
  open: boolean;
  saleId: number | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { sellers, categories } = useCatalog();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sellerId, setSellerId] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<string>("Efectivo");
  const [isInvoiced, setIsInvoiced] = useState(false);
  const [taxIdType, setTaxIdType] = useState<"NIT" | "CUI">("NIT");
  const [taxId, setTaxId] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [observations, setObservations] = useState("");
  const [items, setItems] = useState<EditableItem[]>([]);

  useEffect(() => {
    if (!open || !saleId) return;
    let active = true;
    setLoading(true);
    setError(null);

    salesApi
      .get(saleId)
      .then((detail: SaleDetail) => {
        if (!active) return;
        setSellerId(detail.sellerId);
        setPaymentMethod(detail.paymentMethod);
        setIsInvoiced(detail.isInvoiced);
        if (detail.client) {
          if (detail.client.taxIdType === "NIT" || detail.client.taxIdType === "CUI") {
            setTaxIdType(detail.client.taxIdType);
          }
          setTaxId(detail.client.taxId);
          setClientName(detail.client.name);
          setClientAddress(detail.client.address || "");
        } else {
          setTaxId("");
          setClientName("");
          setClientAddress("");
        }
        setObservations(detail.observations || "");
        setItems(
          detail.items.map((it) => ({
            id: it.id,
            description: it.description,
            categoryId: it.categoryId,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            commissionRate: it.commissionRate !== null && it.commissionRate !== undefined ? String(it.commissionRate) : "",
          })),
        );
      })
      .catch((err: Error) => {
        if (active) setError(err.message || "Error al cargar la venta");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [open, saleId]);

  const updateItem = (id: number, field: keyof EditableItem, val: string | number) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it;
        return { ...it, [field]: val };
      }),
    );
  };

  const addItem = () => {
    const defaultCat = categories[0]?.id ?? 1;
    setItems((prev) => [
      ...prev,
      {
        id: Date.now(),
        description: "",
        categoryId: defaultCat,
        quantity: 1,
        unitPrice: 0,
        commissionRate: "",
      },
    ]);
  };

  const removeItem = (id: number) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  const total = items.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0);
  const isCF = taxId.trim().toUpperCase() === "CF";

  const handleSave = async () => {
    if (!saleId) return;
    setError(null);

    if (items.length === 0 || items.every((i) => !i.description.trim() && i.unitPrice === 0)) {
      setError("La venta debe tener al menos un artículo.");
      return;
    }

    if (isInvoiced && isCF && total >= 2500) {
      setError("Para ventas de Q2,500.00 o más la SAT requiere NIT o CUI del comprador.");
      return;
    }

    if (isInvoiced && !clientName.trim()) {
      setError("El nombre del cliente es obligatorio para ventas facturadas.");
      return;
    }

    const saleItems: SaleItemInput[] = items.map((it) => {
      const parsedComm = parseFloat(it.commissionRate);
      return {
        description: it.description.trim() || "Artículo",
        categoryId: it.categoryId,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        commissionRate: isNaN(parsedComm) ? null : parsedComm,
      };
    });

    const clientPayload = isInvoiced
      ? {
          taxIdType: isCF ? ("CF" as const) : taxIdType,
          taxId: isCF ? "CF" : taxId.trim().toUpperCase(),
          name: clientName.trim() || (isCF ? "Consumidor Final" : "Cliente"),
          address: clientAddress.trim() || undefined,
        }
      : undefined;

    const payload: UpdateSaleInput = {
      sellerId,
      paymentMethod: paymentMethod as PaymentMethod,
      isInvoiced,
      client: clientPayload,
      observations: observations.trim() || undefined,
      items: saleItems,
    };

    setSaving(true);
    try {
      await salesApi.update(saleId, payload);
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al actualizar la venta";
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const sellerOptions = sellers.map((s) => s.fullName);
  const currentSellerName = sellers.find((s) => s.id === sellerId)?.fullName ?? sellerOptions[0] ?? "";

  return (
    <Modal
      open={open}
      title={`Editar venta #${saleId}`}
      onClose={onClose}
      onConfirm={handleSave}
      confirmLabel={saving ? "Guardando..." : "Guardar cambios"}
    >
      {loading ? (
        <div style={{ padding: "30px", textAlign: "center", color: "var(--color-muted)" }}>
          <Icon name="history" size="md" />
          <p style={{ marginTop: "10px" }}>Cargando datos de la venta...</p>
        </div>
      ) : (
        <div className="screen-stack" style={{ gap: "16px", maxHeight: "70vh", overflowY: "auto", paddingRight: "6px" }}>
          {error && (
            <div className="cf-warning" style={{ background: "var(--color-danger-soft, #fee2e2)", borderColor: "var(--color-danger, #ef4444)" }}>
              <Icon name="bell" size="sm" />
              <span>{error}</span>
            </div>
          )}

          <div className="form-grid two">
            <Select
              label="Vendedor"
              value={currentSellerName}
              options={sellerOptions}
              onChange={(name) => {
                const found = sellers.find((s) => s.fullName === name);
                if (found) setSellerId(found.id);
              }}
            />
            <div className="field">
              <span className="field-label">Método de pago</span>
              <Segmented
                options={["Efectivo", "Transferencia", "Tarjeta"]}
                value={paymentMethod}
                onChange={setPaymentMethod}
              />
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderTop: "1px solid var(--color-line)" }}>
            <div>
              <strong style={{ fontSize: "14px" }}>Factura</strong>
              <div style={{ fontSize: "12px", color: "var(--color-muted)" }}>¿Esta venta fue facturada?</div>
            </div>
            <Toggle checked={isInvoiced} onChange={setIsInvoiced} label="Facturada" />
          </div>

          {isInvoiced && (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", background: "var(--color-surface-soft)", padding: "12px", borderRadius: "var(--radius-sm)" }}>
              <div style={{ display: "flex", gap: "8px" }}>
                <div className="id-type-seg">
                  <UnstyledButton
                    className={taxIdType === "NIT" ? "id-type-btn selected" : "id-type-btn"}
                    onClick={() => setTaxIdType("NIT")}
                  >
                    NIT
                  </UnstyledButton>
                  <UnstyledButton
                    className={taxIdType === "CUI" ? "id-type-btn selected" : "id-type-btn"}
                    onClick={() => setTaxIdType("CUI")}
                  >
                    CUI
                  </UnstyledButton>
                </div>
                <TextInput
                  value={taxId}
                  onChange={setTaxId}
                  placeholder={taxIdType === "NIT" ? "NIT del cliente" : "CUI"}
                />
                <button
                  type="button"
                  className="cf-btn"
                  onClick={() => {
                    setTaxId("CF");
                    setClientName("Consumidor Final");
                    setClientAddress("Ciudad");
                  }}
                >
                  CF
                </button>
              </div>

              <TextInput
                label="Nombre / Razón social"
                value={clientName}
                onChange={setClientName}
                placeholder="Nombre del cliente"
              />
              <TextInput
                label="Dirección fiscal"
                value={clientAddress}
                onChange={setClientAddress}
                placeholder="Dirección fiscal"
              />
            </div>
          )}

          <div>
            <strong style={{ fontSize: "13px" }}>Artículos de la venta</strong>
            <div style={{ overflowX: "auto", marginTop: "8px" }}>
              <table className="items-table" style={{ width: "100%", fontSize: "12px" }}>
                <thead>
                  <tr>
                    <th>Descripción</th>
                    <th>Categoría</th>
                    <th>Cant.</th>
                    <th>Precio</th>
                    <th>Comisión %</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.id}>
                      <td>
                        <input
                          className="cell-input"
                          value={it.description}
                          onChange={(e) => updateItem(it.id, "description", e.target.value)}
                        />
                      </td>
                      <td>
                        <select
                          className="cell-select"
                          value={it.categoryId}
                          onChange={(e) => updateItem(it.id, "categoryId", Number(e.target.value))}
                        >
                          {categories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          className="cell-input narrow"
                          type="number"
                          min={1}
                          value={it.quantity}
                          onChange={(e) => updateItem(it.id, "quantity", Math.max(1, Number(e.target.value)))}
                        />
                      </td>
                      <td>
                        <input
                          className="cell-input"
                          value={it.unitPrice}
                          onChange={(e) => updateItem(it.id, "unitPrice", Number(e.target.value.replace(/[^0-9.]/g, "")))}
                        />
                      </td>
                      <td>
                        <input
                          className="cell-input narrow"
                          placeholder="Pend."
                          value={it.commissionRate}
                          onChange={(e) => updateItem(it.id, "commissionRate", e.target.value)}
                        />
                      </td>
                      <td>
                        <button type="button" className="icon-button" onClick={() => removeItem(it.id)}>
                          <Icon name="trash" size="sm" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              className="add-item-btn"
              style={{ marginTop: "6px" }}
              onClick={addItem}
            >
              <Icon name="plus" size="sm" />
              <span>Agregar artículo</span>
            </button>
          </div>

          <TextArea
            label="Observaciones"
            value={observations}
            onChange={setObservations}
            placeholder="Observaciones de la venta..."
          />

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--color-line)", paddingTop: "12px" }}>
            <span style={{ fontSize: "14px", fontWeight: "600" }}>Total actualizado:</span>
            <strong style={{ fontSize: "18px", color: "var(--color-primary)" }}>{formatQuetzales(total)}</strong>
          </div>

          <div style={{ fontSize: "11px", color: "var(--color-muted)", display: "flex", alignItems: "center", gap: "6px" }}>
            <Icon name="lock" size="sm" />
            <span>Esta edición quedará registrada en la bitácora de auditoría.</span>
          </div>
        </div>
      )}
    </Modal>
  );
}
