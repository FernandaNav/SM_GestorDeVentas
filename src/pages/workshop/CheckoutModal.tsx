import { useState } from "react";
import { CF_MAX_INVOICE_TOTAL, PAYMENT_METHODS, type PaymentMethod, type TaxIdType } from "@shared/constants";
import { createSaleSchema } from "@shared/schemas/sales";
import { workshopCheckoutSchema, type WorkshopCheckoutInput, type WorkshopOrderDetail } from "@shared/schemas/workshop";
import { ApiError } from "@/api/client";
import { useCatalog } from "@/catalog/CatalogContext";
import Segmented from "@/components/Segmented";
import { Icon, Modal, Select, TextArea, TextInput, Toggle, UnstyledButton } from "@/components/ui";
import { formatQuetzales } from "@/lib/format";

type Props = {
  order: WorkshopOrderDetail;
  onClose: () => void;
  onConfirm: (input: WorkshopCheckoutInput) => Promise<void>;
};

// Cobrar y entregar: los artículos salen de la orden, aquí solo se piden los datos del
// cobro. La venta se valida con las mismas reglas que Nueva venta (createSaleSchema).
export default function CheckoutModal({ order, onClose, onConfirm }: Props) {
  const { sellers } = useCatalog();
  const [sellerName, setSellerName] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("Efectivo");
  const [isInvoiced, setIsInvoiced] = useState(false);
  const [taxIdType, setTaxIdType] = useState<TaxIdType>("NIT");
  const [taxId, setTaxId] = useState("");
  const [clientName, setClientName] = useState(order.clientName);
  const [clientAddress, setClientAddress] = useState("");
  const [observations, setObservations] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const seller = sellers.find((s) => s.fullName === sellerName) ?? sellers[0];
  const total = order.itemsTotal;
  const showCfWarning = isInvoiced && taxIdType === "CF" && total >= CF_MAX_INVOICE_TOTAL;

  const handleFillCF = () => {
    setTaxIdType("CF");
    setTaxId("CF");
    setClientName("Consumidor Final");
    setClientAddress("Ciudad");
  };

  const handleConfirm = async () => {
    const input = {
      sellerId: seller?.id,
      paymentMethod,
      isInvoiced,
      client: isInvoiced ? { taxIdType, taxId, name: clientName, address: clientAddress } : undefined,
      observations: observations.trim() || undefined,
    };
    const parsed = workshopCheckoutSchema.safeParse(input);
    // Con los artículos de la orden se revisan las reglas de venta que dependen del total
    const saleCheck = createSaleSchema.safeParse({
      ...input,
      items: order.items.map((item) => ({
        description: item.description,
        categoryId: item.categoryId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
    });
    if (!parsed.success || !saleCheck.success) {
      const issues = [...(parsed.success ? [] : parsed.error.issues), ...(saleCheck.success ? [] : saleCheck.error.issues)];
      setErrors(Object.fromEntries(issues.map((issue) => [issue.path.join("."), issue.message])));
      return;
    }
    setSaving(true);
    try {
      await onConfirm(parsed.data);
      onClose();
    } catch (error) {
      setErrors(error instanceof ApiError ? { ...error.fields, _form: error.message } : { _form: "No se pudo cobrar" });
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title="Cobrar y entregar"
      onClose={onClose}
      onConfirm={handleConfirm}
      confirmLabel={saving ? "Cobrando..." : `Cobrar ${formatQuetzales(total)}`}
      confirmDisabled={saving}
    >
      <div className="confirm-box">
        <div><span>Servicios y repuestos</span><strong>{order.items.length}</strong></div>
        <div><span>Total a cobrar</span><strong>{formatQuetzales(total)}</strong></div>
      </div>

      <div className="form-grid two" style={{ marginTop: 16 }}>
        <div className="span-two">
          <Select label="Cobra (vendedor)" value={seller?.fullName ?? ""} options={sellers.map((s) => s.fullName)} onChange={setSellerName} />
          {(errors.sellerId || sellers.length === 0) && (
            <span className="field-error">{sellers.length === 0 ? "No hay vendedores activos; agrégalos en Personal" : errors.sellerId}</span>
          )}
        </div>
        <div className="span-two">
          <div className="field-label" style={{ marginBottom: 8 }}>Método de pago</div>
          <Segmented
            options={[...PAYMENT_METHODS]}
            value={paymentMethod}
            onChange={(value) => setPaymentMethod(value as PaymentMethod)}
            icons={["cash", "bank", "card"]}
          />
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <Toggle checked={isInvoiced} onChange={setIsInvoiced} label="¿Facturar este servicio?" />
      </div>

      {isInvoiced && (
        <div style={{ marginTop: 16 }} className="screen-stack">
          <div className="client-id-row">
            <div className="id-type-seg">
              {(["NIT", "CUI"] as const).map((type) => (
                <UnstyledButton
                  key={type}
                  className={taxIdType === type ? "id-type-btn selected" : "id-type-btn"}
                  onClick={() => {
                    setTaxIdType(type);
                    if (taxId.toUpperCase() === "CF") setTaxId("");
                  }}
                >
                  {type}
                </UnstyledButton>
              ))}
            </div>
            <TextInput
              placeholder={taxIdType === "CUI" ? "Ej. 2345 12345 0101" : "Ej. 5489632-1"}
              value={taxId}
              onChange={setTaxId}
              error={errors["client.taxId"]}
            />
            <button type="button" className="cf-btn" onClick={handleFillCF}>
              CF
            </button>
          </div>
          {showCfWarning && (
            <div className="cf-warning">
              <Icon name="bell" size="sm" />
              <span>Para ventas de {formatQuetzales(CF_MAX_INVOICE_TOTAL)} o más la SAT requiere NIT o CUI del comprador.</span>
            </div>
          )}
          <TextInput label="Nombre o razón social" value={clientName} onChange={setClientName} error={errors["client.name"]} />
          <TextInput label="Dirección fiscal (opcional)" value={clientAddress} onChange={setClientAddress} error={errors["client.address"]} />
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <TextArea label="Observaciones (opcional)" value={observations} onChange={setObservations} placeholder="Ej. Garantía de 30 días en mano de obra" />
      </div>

      {(errors._form || errors.client) && <div className="field-error" style={{ marginTop: 12 }}>{errors._form ?? errors.client}</div>}
    </Modal>
  );
}
