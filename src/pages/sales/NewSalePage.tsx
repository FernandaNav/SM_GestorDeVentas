import { useState } from "react";
import { CF_MAX_INVOICE_TOTAL, type PaymentMethod, type Role } from "@shared/constants";
import { createSaleSchema, type CreateSaleInput, type SaleDetail, type SaleItemInput } from "@shared/schemas/sales";
import { ApiError, errorMessage } from "@/api/client";
import { salesApi } from "@/api/sales";
import { useCatalog } from "@/catalog/CatalogContext";
import Segmented from "@/components/Segmented";
import { Badge, Button, Card, FormError, Icon, Modal, Select, TextArea, TextInput, Toggle, UnstyledButton } from "@/components/ui";
import { useApiQuery } from "@/hooks/useApiQuery";
import { useClientLookup } from "@/hooks/useClientLookup";
import { useCurrentDate } from "@/hooks/useCurrentDate";
import { capitalize, formatQuetzales, SALE_DATE_FORMAT, SALE_TIME_FORMAT } from "@/lib/format";
import { formatTaxId } from "@/lib/taxId";
import { issuesToErrors } from "@/lib/validation";
import ClientLookupHint from "@/pages/sales/ClientLookupHint";
import { SaleInvoice } from "@/pages/sales/InvoicePreview";
import ItemsTable, { type SaleItem } from "@/pages/sales/ItemsTable";
import SaleSuccess from "@/pages/sales/SaleSuccess";

const CHOOSE_SELLER = "Elige el vendedor";

/** Fila inicial: su categoría y su comisión las llena ItemsTable con lo configurado actualmente. */
const emptyItem = (): SaleItem => ({ id: 1, desc: "", cat: "", qty: 1, price: 0, commission: "" });

export default function NewSale({ role, onHistory }: { role: Role; onHistory: () => void }) {
  const { sellers, sellerNames, categories } = useCatalog();
  const isAdmin = role === "Administrador";
  const now = useCurrentDate();
  const saleTimestamp = `${capitalize(SALE_DATE_FORMAT.format(now))} · ${SALE_TIME_FORMAT.format(now)}`;

  const [items, setItems] = useState<SaleItem[]>(() => [emptyItem()]);
  const [chosenSeller, setSeller] = useState("");
  // La comisión depende de quién vendió: solo se da por hecho si no hay a quién más elegir
  const seller = chosenSeller || (sellerNames.length === 1 ? sellerNames[0] : "");
  const [paymentMethod, setPaymentMethod] = useState("Tarjeta");
  const [isInvoiced, setIsInvoiced] = useState(true);
  const [idType, setIdType] = useState<"NIT" | "CUI">("NIT");
  const [clientId, setClientId] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  // Se intentó poner CF con un total que lo impide: se avisa sin llenar los datos
  const [cfRejected, setCfRejected] = useState(false);
  const [observations, setObservations] = useState("");
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [createdSale, setCreatedSale] = useState<SaleDetail | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const clearErrors = () => {
    setFormError(null);
    setFieldErrors({});
  };

  /** Envuelve un setter: cuando la persona corrige el formulario desaparecen los avisos anteriores. */
  const onEdit =
    <Value,>(setValue: (value: Value) => void) =>
    (value: Value) => {
      clearErrors();
      setValue(value);
    };

  // Contador y alerta de facturas del mes (punto 5)
  const { data: invoiceUsage, refetch: refetchInvoiceUsage } = useApiQuery(
    "sales:invoice-usage",
    salesApi.invoiceUsage,
  );

  // Autocompletar cliente al escribir NIT / CUI (RNF 3.1)
  const clientLookup = useClientLookup(clientId, (client) => {
    setClientName(client.name);
    setClientAddress(client.address || "");
    if (client.taxIdType === "NIT" || client.taxIdType === "CUI") {
      setIdType(client.taxIdType);
      setClientId(formatTaxId(client.taxIdType, client.taxId));
    }
  });

  const total = items.reduce((acc, item) => acc + item.qty * item.price, 0);
  const isCF = clientId.trim().toUpperCase() === "CF";
  const isCfWarning = isInvoiced && (isCF || cfRejected) && total >= CF_MAX_INVOICE_TOTAL;

  const handleResetSale = () => {
    setItems([emptyItem()]);
    setSeller("");
    setPaymentMethod("Tarjeta");
    setIsInvoiced(true);
    setIdType("NIT");
    setClientId("");
    setClientName("");
    setClientAddress("");
    setCfRejected(false);
    setObservations("");
    setIsConfirmed(false);
    setCreatedSale(null);
    clearErrors();
    refetchInvoiceUsage();
  };

  // Un NIT distinto es otro cliente: no se conservan los datos que se llenaron solos con el anterior
  const handleClientIdChange = (value: string) => {
    const next = formatTaxId(idType, value);
    if (next === clientId) return;
    clearErrors();
    setCfRejected(false);
    setClientId(next);
    if (clientLookup.client || isCF) {
      setClientName("");
      setClientAddress("");
      clientLookup.clear();
    }
  };

  const handleIdTypeChange = (type: "NIT" | "CUI") => {
    clearErrors();
    setIdType(type);
    setClientId(formatTaxId(type, clientId));
  };

  const handleFillCF = () => {
    clearErrors();
    // Desde Q2,500 la SAT exige NIT o CUI: no se llena como Consumidor Final, solo se avisa
    if (total >= CF_MAX_INVOICE_TOTAL) {
      setCfRejected(true);
      return;
    }
    setCfRejected(false);
    setClientId("CF");
    setClientName("Consumidor Final");
    setClientAddress("Ciudad");
  };

  const totalCommission = isAdmin
    ? items.reduce((acc, item) => {
        const pct = parseFloat(item.commission);
        return acc + (isNaN(pct) ? 0 : (item.qty * item.price * pct) / 100);
      }, 0)
    : 0;

  const selectedSeller = sellers.find((s) => s.fullName === seller);

  /** Arma la venta con lo escrito en el formulario. */
  const buildPayload = (sellerId: number): CreateSaleInput => {
    const validItems = items.filter((i) => i.desc.trim() !== "" || i.price > 0);
    const resolvedItems = validItems.length > 0 ? validItems : items;

    const saleItems: SaleItemInput[] = resolvedItems.map((i) => {
      const catObj = categories.find((c) => c.name === i.cat) || categories[0];
      const parsedComm = parseFloat(i.commission);
      const commRate = isAdmin ? (isNaN(parsedComm) ? null : parsedComm) : undefined;
      return {
        description: i.desc.trim() || "Artículo",
        categoryId: catObj?.id ?? 1,
        quantity: i.qty,
        unitPrice: i.price,
        commissionRate: commRate,
      };
    });

    const clientPayload = isInvoiced
      ? {
          taxIdType: isCF ? ("CF" as const) : idType,
          taxId: isCF ? "CF" : clientId.trim().toUpperCase(),
          name: clientName.trim() || (isCF ? "Consumidor Final" : ""),
          address: clientAddress.trim() || undefined,
        }
      : undefined;

    return {
      sellerId,
      paymentMethod: paymentMethod as PaymentMethod,
      isInvoiced,
      client: clientPayload,
      observations: observations.trim() || undefined,
      items: saleItems,
    };
  };

  // Mismas reglas que el servidor: lo que falte se avisa antes de pedir la confirmación (RNF 8.1)
  const handleRequestConfirm = () => {
    clearErrors();
    if (!selectedSeller) {
      setFieldErrors({ sellerId: CHOOSE_SELLER });
      setFormError(sellers.length > 0 ? CHOOSE_SELLER : "No hay vendedores activos registrados en el sistema.");
      return;
    }

    const parsed = createSaleSchema.safeParse(buildPayload(selectedSeller.id));
    if (!parsed.success) {
      setFieldErrors(issuesToErrors(parsed.error.issues));
      setFormError(parsed.error.issues[0].message);
      return;
    }
    setIsConfirmModalOpen(true);
  };

  const handleConfirmSale = async () => {
    if (!selectedSeller) return;

    setFormError(null);
    setIsSubmitting(true);
    try {
      const created = await salesApi.create(buildPayload(selectedSeller.id));
      setCreatedSale(created);
      setIsConfirmModalOpen(false);
      setIsConfirmed(true);
      refetchInvoiceUsage();
    } catch (err: unknown) {
      if (err instanceof ApiError) setFieldErrors(err.fields);
      setFormError(errorMessage(err, "Error al registrar la venta en el servidor"));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isConfirmed && createdSale) {
    if (isInvoiced) {
      return <SaleInvoice sale={createdSale} onNewSale={handleResetSale} />;
    }
    return <SaleSuccess total={createdSale.total} onNewSale={handleResetSale} onHistory={onHistory} />;
  }

  return (
    <div className="sale-layout">
      <div className="sale-main screen-stack">
        {/* Alerta de límite de facturas del mes (punto 5) */}
        {invoiceUsage?.isAlert && isInvoiced && (
          <div className="cf-warning" role="alert" style={{ background: "rgba(245, 158, 11, 0.15)", borderColor: "var(--color-warning, #f59e0b)" }}>
            <Icon name="bell" size="sm" />
            <span>
              <strong>Alerta de facturación ({invoiceUsage.percent}% alcanzado):</strong> Has emitido {invoiceUsage.issued} de {invoiceUsage.limit} facturas este mes. Quedan {invoiceUsage.remaining} facturas disponibles.
            </span>
          </div>
        )}

        <Card className="form-card">
          <div className="form-section-title">
            <span>1</span>
            <div>
              <strong>Datos de la venta</strong>
              <small>Información principal de la operación</small>
            </div>
          </div>
          <div className="form-grid two">
            <div className="field">
              <span className="field-label">Fecha y hora</span>
              <div className="readonly-datetime">
                <strong>{saleTimestamp}</strong>
                <small>Hora registrada por el sistema</small>
              </div>
            </div>
            <div>
              <Select
                label="Vendedor"
                value={seller || CHOOSE_SELLER}
                options={seller ? sellerNames : [CHOOSE_SELLER, ...sellerNames]}
                onChange={onEdit(setSeller)}
              />
              {fieldErrors.sellerId && <span className="field-error">{fieldErrors.sellerId}</span>}
            </div>
          </div>
          <div className="field-block">
            <div className="field-label">Método de pago</div>
            <Segmented
              options={["Efectivo", "Transferencia", "Tarjeta"]}
              value={paymentMethod}
              onChange={setPaymentMethod}
              icons={["cash", "bank", "card"]}
            />
          </div>
        </Card>

        <Card className="form-card">
          <div className="form-section-title">
            <span>2</span>
            <div>
              <strong>Artículos</strong>
              <small>Productos o servicios incluidos en esta venta</small>
            </div>
          </div>
          <ItemsTable items={items} setItems={onEdit(setItems)} isAdmin={isAdmin} />
        </Card>

        <Card className="form-card">
          <div className="invoice-toggle">
            <div>
              <div className="card-title">Facturación</div>
              <div className="muted small">
                {invoiceUsage
                  ? `Facturas este mes: ${invoiceUsage.issued} / ${invoiceUsage.limit} (${invoiceUsage.percent}%)`
                  : "Emisión de documento de venta"}
              </div>
            </div>
            <Toggle checked={isInvoiced} onChange={onEdit(setIsInvoiced)} label="¿Facturar esta venta?" />
          </div>

          {isInvoiced && (
            <div className="invoice-fields">
              <div className="section-divider" />
              <div className="form-section-title">
                <span>3</span>
                <div>
                  <strong>Datos del cliente</strong>
                  <small>Escribe el NIT o CUI para autocompletar clientes frecuentes</small>
                </div>
              </div>

              <div className="client-id-row">
                <div className="id-type-seg">
                  <UnstyledButton
                    className={idType === "NIT" ? "id-type-btn selected" : "id-type-btn"}
                    onClick={() => handleIdTypeChange("NIT")}
                  >
                    NIT
                  </UnstyledButton>
                  <UnstyledButton
                    className={idType === "CUI" ? "id-type-btn selected" : "id-type-btn"}
                    onClick={() => handleIdTypeChange("CUI")}
                  >
                    CUI
                  </UnstyledButton>
                </div>
                <TextInput
                  placeholder={idType === "NIT" ? "Ej. 5489632-1" : "Ej. 2345 12345 0101"}
                  value={clientId}
                  onChange={handleClientIdChange}
                  icon="search"
                  error={fieldErrors["client.taxId"]}
                />
                <button type="button" className="cf-btn" onClick={handleFillCF}>
                  Consumidor Final (CF)
                </button>
              </div>

              <ClientLookupHint loading={clientLookup.loading} client={clientLookup.client} idType={idType} />

              {isCfWarning && (
                <div className="cf-warning">
                  <Icon name="bell" size="sm" />
                  <span>Para ventas de {formatQuetzales(CF_MAX_INVOICE_TOTAL)} o más la SAT requiere NIT o CUI del comprador; no se puede facturar como Consumidor Final.</span>
                </div>
              )}

              <div className="form-grid two">
                <div className="span-two">
                  <TextInput
                    label="Nombre o razón social"
                    value={clientName}
                    onChange={onEdit(setClientName)}
                    placeholder="Nombre del cliente o empresa"
                    error={fieldErrors["client.name"]}
                  />
                </div>
                <div className="span-two">
                  <TextInput
                    label="Dirección fiscal"
                    value={clientAddress}
                    onChange={onEdit(setClientAddress)}
                    placeholder="Dirección fiscal para factura"
                  />
                </div>
                <div className="span-two">
                  <TextArea
                    label="Observaciones en documento (opcional)"
                    value={observations}
                    onChange={setObservations}
                    placeholder="Ej. Crédito 30 días, referencia de pedido, etc."
                  />
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>

      <aside className="sale-summary">
        <Card>
          <div className="summary-title">Resumen de venta</div>
          <div className="summary-items">
            {items.map((item) => (
              <div key={item.id} className="summary-item-line">
                <span className="summary-item-desc">
                  {item.desc || "Artículo sin nombre"} <span className="summary-item-qty">×{item.qty}</span>
                </span>
                <strong>{formatQuetzales(item.qty * item.price)}</strong>
              </div>
            ))}
          </div>

          <div className="summary-lines">
            <div>
              <span>Subtotal</span>
              <strong>{formatQuetzales(total)}</strong>
            </div>
            <div>
              <span>Método de pago</span>
              <strong>{paymentMethod}</strong>
            </div>
            {isAdmin && (
              <div>
                <span>Comisión estimada</span>
                <strong>{formatQuetzales(totalCommission)}</strong>
              </div>
            )}
            <div>
              <span>Facturar</span>
              <Badge tone={isInvoiced ? "success" : "neutral"}>{isInvoiced ? "Sí" : "No"}</Badge>
            </div>
          </div>

          <div className="summary-total">
            <span>Total</span>
            <strong>{formatQuetzales(total)}</strong>
          </div>

          {formError && !isConfirmModalOpen && <FormError message={formError} />}

          <Button className="full-button" icon="check" onClick={handleRequestConfirm} disabled={total <= 0 || isSubmitting}>
            {isSubmitting ? "Registrando..." : "Confirmar venta"}
          </Button>

          <div className="summary-note">
            <Icon name="lock" size="sm" /> Venta procesada y almacenada en el servidor
          </div>
        </Card>
      </aside>

      <Modal
        open={isConfirmModalOpen}
        title="Confirmar venta"
        onClose={() => setIsConfirmModalOpen(false)}
        onConfirm={handleConfirmSale}
        confirmLabel={isSubmitting ? "Guardando..." : "Registrar venta"}
        confirmDisabled={isSubmitting}
      >
        {formError && <FormError message={formError} />}
        <div className="confirm-box">
          <div>
            <span>Total</span>
            <strong>{formatQuetzales(total)}</strong>
          </div>
          <div>
            <span>Vendedor</span>
            <strong>{seller}</strong>
          </div>
          <div>
            <span>Método de pago</span>
            <strong>{paymentMethod}</strong>
          </div>
          {isInvoiced && (
            <div>
              <span>Cliente</span>
              <strong>{clientName || (isCF ? "Consumidor Final" : "CF")}</strong>
            </div>
          )}
          <div>
            <span>Factura</span>
            <strong>{isInvoiced ? "Sí" : "No"}</strong>
          </div>
        </div>
        <div className="modal-hint">
          {isInvoiced
            ? "Al confirmar, la venta se registrará en el servidor y se generará el documento de venta listo para imprimir."
            : "Al confirmar, la venta se guardará en el servidor sin factura."}
        </div>
      </Modal>
    </div>
  );
}
