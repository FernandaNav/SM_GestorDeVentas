import { settingsApi } from "@/api/settings";
import { Badge, Button, Icon } from "@/components/ui";
import { useApiQuery } from "@/hooks/useApiQuery";
import logo from "@/imports/solomotos-logo.png";
import { formatQuetzales, numberToWords } from "@/lib/format";

export type InvoiceItemData = {
  id: number;
  desc: string;
  cat?: string;
  qty: number;
  price: number;
};

export default function InvoicePreview({
  saleId,
  saleDate,
  items,
  paymentMethod,
  seller,
  clientId,
  idType,
  clientName,
  clientAddress,
  total,
  observations,
  onNewSale,
  onClose,
}: {
  saleId?: number | string;
  saleDate?: string;
  items: InvoiceItemData[];
  paymentMethod: string;
  seller: string;
  clientId: string;
  idType: string;
  clientName: string;
  clientAddress: string;
  total: number;
  observations?: string | null;
  onNewSale?: () => void;
  onClose?: () => void;
}) {
  const { data: settings } = useApiQuery("settings:invoice", settingsApi.get);
  const companyName = settings?.companyName || "SoloMotos Quetzaltenango";
  const taxId = settings?.taxId || "8214573-6";
  const address = settings?.address || "7a. calle 4-63, zona 2, Quetzaltenango";
  const phone = settings?.phone || "+502 7765 4321";

  const currentDate = new Date();
  const formattedDateTime = saleDate
    ? new Date(saleDate).toLocaleString("es-GT")
    : `${currentDate.toLocaleDateString("es-GT")} · ${currentDate.toLocaleTimeString("es-GT", { hour: "2-digit", minute: "2-digit" })}`;
  const docNumber = saleId ? String(saleId).padStart(5, "0") : String(Math.floor(100 + Math.random() * 900)).padStart(5, "0");

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="invoice-page">
      <div className="invoice-actions">
        <div>
          {onClose && (
            <Button variant="secondary" icon="chevron" onClick={onClose}>
              Volver al historial
            </Button>
          )}
        </div>
        <div>
          <Button variant="secondary" icon="download" onClick={handlePrint}>
            Descargar PDF
          </Button>
          <Button icon="print" onClick={handlePrint}>
            Imprimir
          </Button>
          {onNewSale && (
            <Button variant="secondary" onClick={onNewSale}>
              Registrar otra venta
            </Button>
          )}
        </div>
      </div>

      <div className="invoice-sheet">
        <div className="invoice-head">
          <div className="invoice-brand">
            <img className="brand-logo" src={logo} alt={companyName} />
            <span>Pasión que te mueve</span>
          </div>
          <div className="invoice-meta">
            <Badge tone="info">DOCUMENTO DE VENTA</Badge>
            <strong>No. SM-{docNumber}</strong>
            <span>Fecha: {formattedDateTime}</span>
          </div>
        </div>

        <div className="invoice-company">
          <div>
            <strong>{companyName}</strong>
            <span>NIT: {taxId}</span>
            <span>{address}</span>
            <span>Tel. {phone}</span>
          </div>
          <div>
            <span>Vendedor</span>
            <strong>{seller}</strong>
          </div>
        </div>

        <div className="client-box">
          <div>
            <span>{idType}</span>
            <strong>{clientId || "CF"}</strong>
          </div>
          <div>
            <span>Nombre / Razón social</span>
            <strong>{clientName || "Consumidor Final"}</strong>
          </div>
          <div>
            <span>Dirección fiscal</span>
            <strong>{clientAddress || "Ciudad"}</strong>
          </div>
        </div>

        <div className="invoice-table">
          <div className="invoice-tr invoice-th">
            <span>Cant.</span>
            <span>Descripción</span>
            <span>Precio unit.</span>
            <span>Subtotal</span>
          </div>
          {items.map((item) => (
            <div key={item.id} className="invoice-tr">
              <span>{item.qty}</span>
              <span>
                <strong>{item.desc || "Artículo"}</strong>
                {item.cat && <small>{item.cat}</small>}
              </span>
              <span>{formatQuetzales(item.price)}</span>
              <span>
                <strong>{formatQuetzales(item.qty * item.price)}</strong>
              </span>
            </div>
          ))}
        </div>

        <div className="invoice-total">
          <div>
            <span>Método de pago</span>
            <strong>{paymentMethod}</strong>
          </div>
          <div>
            <span>Total</span>
            <strong>{formatQuetzales(total)}</strong>
          </div>
          <div className="total-words">
            <span>Son:</span>
            <span>{numberToWords(total)}</span>
          </div>
        </div>

        {observations && (
          <div className="invoice-obs">
            <span>Observaciones:</span>
            <span>{observations}</span>
          </div>
        )}

        <div className="fel-block" style={{ background: "var(--color-surface-soft)", border: "1px dashed var(--color-line)" }}>
          <div className="fel-title" style={{ color: "var(--color-muted)" }}>
            <Icon name="file" size="sm" /> Facturación y Certificación SAT
          </div>
          <div style={{ fontSize: "12px", color: "var(--color-muted)", lineHeight: 1.5, marginTop: "6px" }}>
            Documento interno de venta personalizado para SoloMotos. La certificación electrónica ante la SAT (FEL) queda pendiente para la siguiente fase según especificaciones de la empresa.
          </div>
        </div>

        <div className="invoice-footer">
          <span>Gracias por preferir SoloMotos.</span>
          <span>Documento comercial interno emitido por el sistema.</span>
        </div>
      </div>
    </div>
  );
}
