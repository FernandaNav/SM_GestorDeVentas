import { useState } from "react";
import { CF_MAX_INVOICE_TOTAL, INVOICING_OPTIONAL, PAYMENT_METHODS, type PaymentMethod } from "@shared/constants";
import { createSaleSchema } from "@shared/schemas/sales";
import { workshopCheckoutSchema, type WorkshopCheckoutInput, type WorkshopOrderDetail } from "@shared/schemas/workshop";
import { ApiError } from "@/api/client";
import { useCatalog } from "@/catalog/CatalogContext";
import Segmented from "@/components/Segmented";
import { Icon, Modal, Select, TextArea, TextInput, Toggle, UnstyledButton } from "@/components/ui";
import { useClientLookup } from "@/hooks/useClientLookup";
import { formatQuetzales } from "@/lib/format";
import { formatTaxId } from "@/lib/taxId";
import { issuesToErrors } from "@/lib/validation";
import ClientLookupHint from "@/pages/sales/ClientLookupHint";

const CHOOSE_SELLER = "Elige quién cobra";

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
  // Temporal: con INVOICING_OPTIONAL en false todo cobro se factura (ver shared/constants.ts)
  const [isInvoiced, setIsInvoiced] = useState(!INVOICING_OPTIONAL);
  const [taxIdType, setTaxIdType] = useState<"NIT" | "CUI">("NIT");
  const [taxId, setTaxId] = useState("");
  const [clientName, setClientName] = useState(order.clientName);
  const [clientAddress, setClientAddress] = useState("");
  // Se intentó poner CF con un total que lo impide: se avisa sin llenar los datos
  const [cfRejected, setCfRejected] = useState(false);
  const [observations, setObservations] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // La comisión depende de quién cobró: solo se da por hecho si no hay a quién más elegir
  const seller = sellers.find((s) => s.fullName === sellerName) ?? (sellers.length === 1 ? sellers[0] : undefined);
  const total = order.itemsTotal;
  const isCF = taxId === "CF";
  const showCfWarning = isInvoiced && (isCF || cfRejected) && total >= CF_MAX_INVOICE_TOTAL;

  // Autocompletar cliente al escribir NIT / CUI, igual que en Nueva venta (RNF 3.1)
  const clientLookup = useClientLookup(isInvoiced ? taxId : "", (client) => {
    setClientName(client.name);
    setClientAddress(client.address || "");
    if (client.taxIdType === "NIT" || client.taxIdType === "CUI") {
      setTaxIdType(client.taxIdType);
      setTaxId(formatTaxId(client.taxIdType, client.taxId));
    }
  });

  // Un NIT distinto es otro cliente: se vuelve al de la orden en vez de conservar lo que se llenó solo
  const handleTaxIdChange = (value: string) => {
    const next = formatTaxId(taxIdType, value);
    if (next === taxId) return;
    setCfRejected(false);
    setTaxId(next);
    if (clientLookup.client || isCF) {
      setClientName(order.clientName);
      setClientAddress("");
      clientLookup.clear();
    }
  };

  const handleTaxIdTypeChange = (type: "NIT" | "CUI") => {
    setTaxIdType(type);
    setTaxId(isCF ? "" : formatTaxId(type, taxId));
  };

  const handleFillCF = () => {
    // Desde Q2,500 la SAT exige NIT o CUI: no se llena como Consumidor Final, solo se avisa
    if (total >= CF_MAX_INVOICE_TOTAL) {
      setCfRejected(true);
      return;
    }
    setCfRejected(false);
    setTaxId("CF");
    setClientName("Consumidor Final");
    setClientAddress("Ciudad");
  };

  const handleConfirm = async () => {
    const input = {
      sellerId: seller?.id,
      paymentMethod,
      isInvoiced,
      client: isInvoiced ? { taxIdType: isCF ? ("CF" as const) : taxIdType, taxId, name: clientName, address: clientAddress } : undefined,
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
      setErrors(issuesToErrors(issues));
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
          <Select
            label="Cobra (vendedor)"
            value={seller?.fullName ?? CHOOSE_SELLER}
            options={[...(seller ? [] : [CHOOSE_SELLER]), ...sellers.map((s) => s.fullName)]}
            onChange={setSellerName}
          />
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

      {INVOICING_OPTIONAL && (
        <div style={{ marginTop: 16 }}>
          <Toggle checked={isInvoiced} onChange={setIsInvoiced} label="¿Facturar este servicio?" />
        </div>
      )}

      {isInvoiced && (
        <div style={{ marginTop: 16 }} className="screen-stack">
          <div className="client-id-row">
            <div className="id-type-seg">
              {(["NIT", "CUI"] as const).map((type) => (
                <UnstyledButton
                  key={type}
                  className={!isCF && taxIdType === type ? "id-type-btn selected" : "id-type-btn"}
                  onClick={() => handleTaxIdTypeChange(type)}
                >
                  {type}
                </UnstyledButton>
              ))}
            </div>
            <TextInput
              placeholder={taxIdType === "CUI" ? "Ej. 2345 12345 0101" : "Ej. 5489632-1"}
              value={taxId}
              onChange={handleTaxIdChange}
              error={errors["client.taxId"]}
            />
            <button type="button" className="cf-btn" onClick={handleFillCF}>
              CF
            </button>
          </div>
          <ClientLookupHint loading={clientLookup.loading} client={clientLookup.client} idType={taxIdType} />
          {showCfWarning && (
            <div className="cf-warning">
              <Icon name="bell" size="sm" />
              <span>Para ventas de {formatQuetzales(CF_MAX_INVOICE_TOTAL)} o más la SAT requiere NIT o CUI del comprador; no se puede facturar como Consumidor Final.</span>
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
