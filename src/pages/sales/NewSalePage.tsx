import { useState } from "react";
import type { Role } from "@shared/constants";
import { useCatalog } from "@/catalog/CatalogContext";
import Segmented from "@/components/Segmented";
import { Badge, Button, Card, Icon, Modal, Select, TextArea, TextInput, Toggle, UnstyledButton } from "@/components/ui";
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
  onAddSale: (sale: SaleRecord) => void;
}) {
  const { sellerNames } = useCatalog();
  const isAdmin = role === "Administrador";
  const now = useCurrentDate();
  const saleTimestamp = `${capitalize(SALE_DATE_FORMAT.format(now))} · ${SALE_TIME_FORMAT.format(now)}`;

  // Inputs left blank/empty by default ("cosas libres")
  const [items, setItems] = useState<SaleItem[]>([
    { id: 1, desc: "", cat: "Accesorio", qty: 1, price: 0, commission: "2.5" },
  ]);
  const [chosenSeller, setSeller] = useState("");
  // Hasta que se elija uno, se propone el primer vendedor activo
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

  const handleConfirmSale = () => {
    const validItems = items.filter((i) => i.desc.trim() !== "" || i.price > 0);
    const resolvedItems = validItems.length > 0 ? validItems : items;
    const productSummary = resolvedItems.map((i) => i.desc.trim() || "Artículo").join(", ");
    const primaryCategory = resolvedItems[0]?.cat || "Accesorio";

    const newSaleRecord: SaleRecord = {
      id: Date.now(),
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
      clientName: clientName.trim() || (isCF ? "Consumidor Final" : "Cliente"),
      clientId: clientId.trim() || "CF",
      clientAddress: clientAddress.trim(),
      observations: observations.trim(),
      items: resolvedItems,
    };

    onAddSale(newSaleRecord);
    setIsConfirmModalOpen(false);
    setIsConfirmed(true);
  };

  if (isConfirmed) {
    if (isInvoiced) {
      return (
        <InvoicePreview
          items={items}
          paymentMethod={paymentMethod}
          seller={seller}
          clientId={clientId}
          idType={idType}
          clientName={clientName}
          clientAddress={clientAddress}
          total={total}
          observations={observations}
          onNewSale={handleResetSale}
        />
      );
    }
    return <SaleSuccess total={total} onNewSale={handleResetSale} onHistory={onHistory} />;
  }

  return (
    <div className="sale-layout">
      <div className="sale-main screen-stack">
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
              <div className="muted small">Se emitirá una factura electrónica FEL</div>
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
                  <small>Información requerida para la factura</small>
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
                    label="Observaciones en factura (opcional)"
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
              <span>Factura FEL</span>
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
            onClick={() => setIsConfirmModalOpen(true)}
            disabled={total <= 0}
          >
            Confirmar venta
          </Button>
          <div className="summary-note">
            <Icon name="lock" size="sm" /> Revisa los datos antes de confirmar
          </div>
        </Card>
      </aside>

      <Modal
        open={isConfirmModalOpen}
        title="Confirmar venta"
        onClose={() => setIsConfirmModalOpen(false)}
        onConfirm={handleConfirmSale}
        confirmLabel="Registrar venta"
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
            <span>Factura FEL</span>
            <strong>{isInvoiced ? "Sí" : "No"}</strong>
          </div>
        </div>
        <div className="modal-hint">
          {isInvoiced
            ? "Al confirmar, la venta se guardará y se generará la factura FEL."
            : "Al confirmar, la venta se guardará sin factura."}
        </div>
      </Modal>
    </div>
  );
}
