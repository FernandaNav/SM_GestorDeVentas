import { useEffect, useState } from "react";
import { CF_MAX_INVOICE_TOTAL, INVOICING_OPTIONAL, type PaymentMethod, type SaleItemOrigin } from "@shared/constants";
import { updateSaleSchema, type SaleDetail, type UpdateSaleInput } from "@shared/schemas/sales";
import { errorMessage } from "@/api/client";
import { salesApi } from "@/api/sales";
import { useCatalog } from "@/catalog/CatalogContext";
import MoneyInput from "@/components/MoneyInput";
import Segmented from "@/components/Segmented";
import { FormError, Icon, Modal, Select, TextArea, TextInput, Toggle, UnstyledButton } from "@/components/ui";
import { formatQuetzales } from "@/lib/format";
import { formatTaxId } from "@/lib/taxId";

type EditableItem = {
  id: number;
  description: string;
  categoryId: number;
  quantity: number;
  unitPrice: number;
  commissionRate: string;
  /** Se conserva al guardar para no perder lo cobrado en taller. Un artículo nuevo no lo trae. */
  origin?: SaleItemOrigin;
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
  const [originalSeller, setOriginalSeller] = useState<{ id: number; fullName: string } | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<string>("Efectivo");
  const [isInvoiced, setIsInvoiced] = useState(false);
  const [taxIdType, setTaxIdType] = useState<"NIT" | "CUI">("NIT");
  const [taxId, setTaxId] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  // Se intentó poner CF con un total que lo impide: se avisa sin llenar los datos
  const [cfRejected, setCfRejected] = useState(false);
  const [observations, setObservations] = useState("");
  const [items, setItems] = useState<EditableItem[]>([]);
  const [originalCategories, setOriginalCategories] = useState<{ id: number; name: string }[]>([]);

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
        setOriginalSeller({ id: detail.sellerId, fullName: detail.sellerName });
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
        setOriginalCategories(detail.items.map((it) => ({ id: it.categoryId, name: it.categoryName })));
        setItems(
          detail.items.map((it) => ({
            id: it.id,
            description: it.description,
            categoryId: it.categoryId,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            commissionRate: it.commissionRate !== null && it.commissionRate !== undefined ? String(it.commissionRate) : "",
            origin: it.origin,
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

  // Una categoría desactivada después de la venta se conserva como opción (marcada) para no cambiarla sin querer
  const categoryOptions = [
    ...categories,
    ...originalCategories
      .filter((original, index, all) => !categories.some((c) => c.id === original.id) && all.findIndex((o) => o.id === original.id) === index)
      .map((original) => ({ id: original.id, name: `${original.name} (inactiva)` })),
  ];

  const total = items.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0);
  const isCF = taxId.trim().toUpperCase() === "CF";
  const showCfWarning = (isCF || cfRejected) && total >= CF_MAX_INVOICE_TOTAL;

  const handleTaxIdTypeChange = (type: "NIT" | "CUI") => {
    setTaxIdType(type);
    setTaxId(formatTaxId(type, taxId));
  };

  const handleSave = async () => {
    if (!saleId) return;
    setError(null);

    if (items.length === 0 || items.every((i) => !i.description.trim() && i.unitPrice === 0)) {
      setError("La venta debe tener al menos un artículo.");
      return;
    }

    const saleItems: UpdateSaleInput["items"] = items.map((it) => {
      const parsedComm = parseFloat(it.commissionRate);
      return {
        description: it.description.trim() || "Artículo",
        categoryId: it.categoryId,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        commissionRate: isNaN(parsedComm) ? null : parsedComm,
        origin: it.origin,
      };
    });

    const clientPayload = isInvoiced
      ? {
          taxIdType: isCF ? ("CF" as const) : taxIdType,
          taxId: isCF ? "CF" : taxId.trim().toUpperCase(),
          name: clientName.trim() || (isCF ? "Consumidor Final" : ""),
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

    // Mismas reglas que el servidor, para decir qué corregir antes de enviar (RNF 8.1)
    const parsed = updateSaleSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }

    setSaving(true);
    try {
      await salesApi.update(saleId, payload);
      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(errorMessage(err, "Error al actualizar la venta"));
    } finally {
      setSaving(false);
    }
  };

  // El catálogo solo trae vendedores activos; el de la venta se conserva aunque ya esté inactivo
  const sellerChoices: { id: number; fullName: string }[] =
    originalSeller && !sellers.some((s) => s.id === originalSeller.id) ? [...sellers, originalSeller] : sellers;
  const sellerOptions = sellerChoices.map((s) => s.fullName);
  const currentSellerName = sellerChoices.find((s) => s.id === sellerId)?.fullName ?? "";

  return (
    <Modal
      open={open}
      title={`Editar venta #${saleId}`}
      onClose={onClose}
      onConfirm={handleSave}
      confirmLabel={saving ? "Guardando..." : "Guardar cambios"}
      confirmDisabled={saving || loading}
      wide
    >
      {/* Fuera del área con scroll para que se vea aunque se haya bajado hasta el final */}
      {error && <FormError message={error} />}
      {loading ? (
        <div style={{ padding: "30px", textAlign: "center", color: "var(--color-muted)" }}>
          <Icon name="history" size="md" />
          <p style={{ marginTop: "10px" }}>Cargando datos de la venta...</p>
        </div>
      ) : (
        <div className="screen-stack" style={{ gap: "16px", maxHeight: "calc(100vh - 300px)", overflowY: "auto", overflowX: "hidden", paddingRight: "6px" }}>
          {/* El selector de pago ocupa lo que necesita y el vendedor el resto, para que no se corte */}
          <div className="form-grid" style={{ gridTemplateColumns: "minmax(0, 1fr) auto" }}>
            <Select
              label="Vendedor"
              value={currentSellerName}
              options={sellerOptions}
              onChange={(name) => {
                const found = sellerChoices.find((s) => s.fullName === name);
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

          {/* Temporal: con INVOICING_OPTIONAL en false todo se factura y no se puede quitar la factura (ver shared/constants.ts) */}
          {INVOICING_OPTIONAL ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderTop: "1px solid var(--color-line)" }}>
              <div>
                <strong style={{ fontSize: "14px" }}>Factura</strong>
                <div style={{ fontSize: "13px", color: "var(--color-muted)" }}>¿Esta venta fue facturada?</div>
              </div>
              <Toggle checked={isInvoiced} onChange={setIsInvoiced} label="Facturada" />
            </div>
          ) : (
            isInvoiced && (
              <div style={{ paddingTop: "10px", borderTop: "1px solid var(--color-line)" }}>
                <strong style={{ fontSize: "14px" }}>Datos del cliente</strong>
              </div>
            )
          )}

          {isInvoiced && (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", background: "var(--color-surface-soft)", padding: "12px", borderRadius: "var(--radius-sm)" }}>
              <div style={{ display: "flex", gap: "8px" }}>
                <div className="id-type-seg">
                  <UnstyledButton
                    className={taxIdType === "NIT" ? "id-type-btn selected" : "id-type-btn"}
                    onClick={() => handleTaxIdTypeChange("NIT")}
                  >
                    NIT
                  </UnstyledButton>
                  <UnstyledButton
                    className={taxIdType === "CUI" ? "id-type-btn selected" : "id-type-btn"}
                    onClick={() => handleTaxIdTypeChange("CUI")}
                  >
                    CUI
                  </UnstyledButton>
                </div>
                <TextInput
                  value={taxId}
                  onChange={(value) => {
                    setCfRejected(false);
                    setTaxId(formatTaxId(taxIdType, value));
                  }}
                  placeholder={taxIdType === "NIT" ? "NIT del cliente" : "CUI"}
                />
                <button
                  type="button"
                  className="cf-btn"
                  onClick={() => {
                    // Desde Q2,500 la SAT exige NIT o CUI: no se llena como Consumidor Final, solo se avisa
                    if (total >= CF_MAX_INVOICE_TOTAL) {
                      setCfRejected(true);
                      return;
                    }
                    setCfRejected(false);
                    setTaxId("CF");
                    setClientName("Consumidor Final");
                    setClientAddress("Ciudad");
                  }}
                >
                  CF
                </button>
              </div>
              {showCfWarning && (
                <div className="cf-warning">
                  <Icon name="bell" size="sm" />
                  <span>Para ventas de {formatQuetzales(CF_MAX_INVOICE_TOTAL)} o más la SAT requiere NIT o CUI del comprador; no se puede facturar como Consumidor Final.</span>
                </div>
              )}

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
              <table className="items-table" style={{ width: "100%", fontSize: "13px" }}>
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
                        <Select
                          compact
                          ariaLabel="Categoría"
                          value={String(it.categoryId)}
                          options={categoryOptions.map((c) => ({ value: String(c.id), label: c.name }))}
                          onChange={(value) => updateItem(it.id, "categoryId", Number(value))}
                        />
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
                        <MoneyInput value={it.unitPrice} onChange={(price) => updateItem(it.id, "unitPrice", price)} ariaLabel="Precio" />
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

          <div style={{ fontSize: "13px", color: "var(--color-muted)", display: "flex", alignItems: "center", gap: "6px" }}>
            <Icon name="lock" size="sm" />
            <span>Esta edición quedará registrada en la bitácora de auditoría.</span>
          </div>
        </div>
      )}
    </Modal>
  );
}
