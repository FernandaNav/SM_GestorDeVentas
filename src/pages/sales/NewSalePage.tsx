import { useEffect, useState } from "react";
import type { PaymentMethod, Role } from "@shared/constants";
import type { ClientLookup, CreateSaleInput, SaleDetail, SaleItemInput } from "@shared/schemas/sales";
import { salesApi } from "@/api/sales";
import { useCatalog } from "@/catalog/CatalogContext";
import Segmented from "@/components/Segmented";
import { Badge, Button, Card, Icon, Modal, Select, TextArea, TextInput, Toggle, UnstyledButton } from "@/components/ui";
import { useApiQuery } from "@/hooks/useApiQuery";
import { useCurrentDate } from "@/hooks/useCurrentDate";
import { capitalize, formatQuetzales, SALE_DATE_FORMAT, SALE_TIME_FORMAT } from "@/lib/format";
import InvoicePreview from "@/pages/sales/InvoicePreview";
import ItemsTable from "@/pages/sales/ItemsTable";
import SaleSuccess from "@/pages/sales/SaleSuccess";
import type { SaleItem, SaleRecord } from "@/temporal/localStore";

export default function NewSale({
  role,
  onHistory,
  onAddSale,
}: {
  role: Role;
  onHistory: () => void;
  onAddSale?: (sale: SaleRecord) => void;
}) {
  const { sellers, sellerNames, categories } = useCatalog();
  const isAdmin = role === "Administrador";
  const now = useCurrentDate();
  const saleTimestamp = `${capitalize(SALE_DATE_FORMAT.format(now))} · ${SALE_TIME_FORMAT.format(now)}`;

  const [items, setItems] = useState<SaleItem[]>([
    { id: 1, desc: "", cat: "Accesorio", qty: 1, price: 0, commission: "2.5" },
  ]);
  const [chosenSeller, setSeller] = useState("");
  const seller = chosenSeller || sellerNames[0] || "";
  const [paymentMethod, setPaymentMethod] = useState("Tarjeta");
  const [isInvoiced, setIsInvoiced] = useState(true);
  const [idType, setIdType] = useState<"NIT" | "CUI">("NIT");
  const [clientId, setClientId] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [observations, setObservations] = useState("");
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [createdSale, setCreatedSale] = useState<SaleDetail | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Contador y alerta de facturas del mes (punto 5)
  const { data: invoiceUsage, refetch: refetchInvoiceUsage } = useApiQuery(
    "sales:invoice-usage",
    salesApi.invoiceUsage,
  );

  // Autocompletar cliente al escribir NIT / CUI (RNF 3.1)
  const [clientLookupState, setClientLookupState] = useState<{
    loading: boolean;
    found: boolean;
    client: ClientLookup | null;
  }>({ loading: false, found: false, client: null });

  useEffect(() => {
    const clean = clientId.trim().toUpperCase();
    if (!clean || clean === "CF" || clean.length < 3) {
      setClientLookupState({ loading: false, found: false, client: null });
      return;
    }

    let active = true;
    setClientLookupState((prev) => ({ ...prev, loading: true }));

    const timer = setTimeout(async () => {
      try {
        const client = await salesApi.lookupClient(clean);
        if (!active) return;
        if (client) {
          setClientName(client.name);
          setClientAddress(client.address || "");
          if (client.taxIdType === "NIT" || client.taxIdType === "CUI") {
            setIdType(client.taxIdType);
          }
          setClientLookupState({ loading: false, found: true, client });
        } else {
          setClientLookupState({ loading: false, found: false, client: null });
        }
      } catch {
        if (active) setClientLookupState({ loading: false, found: false, client: null });
      }
    }, 350);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [clientId]);

  const total = items.reduce((acc, item) => acc + item.qty * item.price, 0);
  const isCF = clientId.trim().toUpperCase() === "CF";
  const isCfWarning = isInvoiced && isCF && total >= 2500;

  const handleResetSale = () => {
    setItems([{ id: 1, desc: "", cat: "Accesorio", qty: 1, price: 0, commission: "2.5" }]);
    setSeller("");
    setPaymentMethod("Tarjeta");
    setIsInvoiced(true);
    setIdType("NIT");
    setClientId("");
    setClientName("");
    setClientAddress("");
    setObservations("");
    setIsConfirmed(false);
    setCreatedSale(null);
    setFormError(null);
    refetchInvoiceUsage();
  };

  const handleFillCF = () => {
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

  const handleConfirmSale = async () => {
    setFormError(null);
    const validItems = items.filter((i) => i.desc.trim() !== "" || i.price > 0);
    const resolvedItems = validItems.length > 0 ? validItems : items;

    // Obtener el vendedor
    const sellerObj = sellers.find((s) => s.fullName === seller) || sellers[0];
    if (!sellerObj) {
      setFormError("No hay vendedores activos registrados en el sistema.");
      return;
    }

    // Validar CF >= 2500
    if (isInvoiced && isCF && total >= 2500) {
      setFormError("Para ventas de Q2,500.00 o más la SAT requiere NIT o CUI del comprador.");
      return;
    }

    if (isInvoiced && !clientName.trim()) {
      setFormError("El nombre o razón social del cliente es obligatorio para facturar.");
      return;
    }

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
          name: clientName.trim() || (isCF ? "Consumidor Final" : "Cliente"),
          address: clientAddress.trim() || undefined,
        }
      : undefined;

    const payload: CreateSaleInput = {
      sellerId: sellerObj.id,
      paymentMethod: paymentMethod as PaymentMethod,
      isInvoiced,
      client: clientPayload,
      observations: observations.trim() || undefined,
      items: saleItems,
    };

    setIsSubmitting(true);
    try {
      const created = await salesApi.create(payload);
      setCreatedSale(created);

      // Si existe el callback local temporal, actualizarlo también
      if (onAddSale) {
        const productSummary = resolvedItems.map((i) => i.desc.trim() || "Artículo").join(", ");
        const primaryCategory = resolvedItems[0]?.cat || "Accesorio";
        onAddSale({
          id: created.id,
          time: saleTimestamp,
          timestamp: Date.now(),
          product: productSummary,
          category: primaryCategory,
          seller,
          paymentMethod,
          amount: total,
          commission: totalCommission > 0 ? formatQuetzales(totalCommission) : "Pendiente",
          invoiced: isInvoiced,
          locked: false,
          clientName: clientPayload?.name,
          clientId: clientPayload?.taxId,
          clientAddress: clientPayload?.address,
          observations: observations.trim(),
          items: resolvedItems,
        });
      }

      setIsConfirmModalOpen(false);
      setIsConfirmed(true);
      refetchInvoiceUsage();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error al registrar la venta en el servidor";
      setFormError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isConfirmed && createdSale) {
    if (isInvoiced) {
      return (
        <InvoicePreview
          saleId={createdSale.id}
          saleDate={createdSale.soldAt}
          items={createdSale.items.map((it) => ({
            id: it.id,
            desc: it.description,
            cat: it.categoryName,
            qty: it.quantity,
            price: it.unitPrice,
          }))}
          paymentMethod={createdSale.paymentMethod}
          seller={createdSale.sellerName}
          clientId={createdSale.client?.taxId || clientId || "CF"}
          idType={createdSale.client?.taxIdType || idType}
          clientName={createdSale.client?.name || clientName}
          clientAddress={createdSale.client?.address || clientAddress}
          total={createdSale.total}
          observations={createdSale.observations}
          onNewSale={handleResetSale}
        />
      );
    }
    return <SaleSuccess total={createdSale.total} onNewSale={handleResetSale} onHistory={onHistory} />;
  }

  return (
    <div className="sale-layout">
      <div className="sale-main screen-stack">
        {formError && (
          <div className="cf-warning" style={{ background: "var(--color-danger-soft, #fee2e2)", borderColor: "var(--color-danger, #ef4444)" }}>
            <Icon name="bell" size="sm" />
            <span>{formError}</span>
          </div>
        )}

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
            <Select label="Vendedor" value={seller} options={sellerNames} onChange={setSeller} />
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
          <ItemsTable items={items} setItems={setItems} isAdmin={isAdmin} />
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
            <Toggle checked={isInvoiced} onChange={setIsInvoiced} label="¿Facturar esta venta?" />
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
                    onClick={() => setIdType("NIT")}
                  >
                    NIT
                  </UnstyledButton>
                  <UnstyledButton
                    className={idType === "CUI" ? "id-type-btn selected" : "id-type-btn"}
                    onClick={() => setIdType("CUI")}
                  >
                    CUI
                  </UnstyledButton>
                </div>
                <TextInput
                  placeholder={idType === "NIT" ? "Ej. 5489632-1" : "Ej. 2345 12345 0101"}
                  value={clientId}
                  onChange={setClientId}
                  icon="search"
                />
                <button type="button" className="cf-btn" onClick={handleFillCF}>
                  Consumidor Final (CF)
                </button>
              </div>

              {clientLookupState.loading && (
                <div style={{ fontSize: "12px", color: "var(--color-primary)", display: "flex", alignItems: "center", gap: "6px", margin: "4px 0" }}>
                  <Icon name="history" size="sm" />
                  <span>Buscando cliente por {idType}...</span>
                </div>
              )}

              {clientLookupState.found && clientLookupState.client && (
                <div style={{ fontSize: "12px", color: "var(--color-success, #10b981)", display: "flex", alignItems: "center", gap: "6px", margin: "4px 0" }}>
                  <Icon name="check" size="sm" />
                  <span>Cliente registrado autocompletado: <strong>{clientLookupState.client.name}</strong></span>
                </div>
              )}

              {isCfWarning && (
                <div className="cf-warning">
                  <Icon name="bell" size="sm" />
                  <span>Para ventas de Q2,500.00 o más la SAT requiere NIT o CUI del comprador.</span>
                </div>
              )}

              <div className="form-grid two">
                <div className="span-two">
                  <TextInput
                    label="Nombre o razón social"
                    value={clientName}
                    onChange={setClientName}
                    placeholder="Nombre del cliente o empresa"
                  />
                </div>
                <div className="span-two">
                  <TextInput
                    label="Dirección fiscal"
                    value={clientAddress}
                    onChange={setClientAddress}
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

          <Button
            className="full-button"
            icon="check"
            onClick={() => {
              setFormError(null);
              setIsConfirmModalOpen(true);
            }}
            disabled={total <= 0 || isSubmitting}
          >
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
      >
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
