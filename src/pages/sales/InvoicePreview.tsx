import { Badge, Button, Icon } from "@/components/ui";
import logo from "@/imports/solomotos-logo.png";
import { formatQuetzales, numberToWords } from "@/lib/format";
import type { SaleItem } from "@/temporal/localStore";

export default function InvoicePreview({
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
}: {
  items: SaleItem[];
  paymentMethod: string;
  seller: string;
  clientId: string;
  idType: string;
  clientName: string;
  clientAddress: string;
  total: number;
  observations: string;
  onNewSale: () => void;
}) {
  const currentDate = new Date();
  const formattedDateTime = `${currentDate.toLocaleDateString("es-GT")} · ${currentDate.toLocaleTimeString("es-GT", { hour: "2-digit", minute: "2-digit" })}`;
  const uuid = "DB4A-849F-11EF-8C9A-00163E002C4F";
  const series = "FEL-A";
  const dteNumber = String(Math.floor(100 + Math.random() * 900)).padStart(5, "0");

  return (
    <div className="invoice-page">
      <div className="invoice-actions">
        <div />
        <div>
          <Button variant="secondary" icon="download">Descargar PDF</Button>
          <Button icon="print">Imprimir</Button>
          <Button variant="secondary" onClick={onNewSale}>Registrar otra venta</Button>
        </div>
      </div>
      <div className="invoice-sheet">
        <div className="invoice-head">
          <div className="invoice-brand">
            <img className="brand-logo" src={logo} alt="SoloMotos" />
            <span>Pasión que te mueve</span>
          </div>
          <div className="invoice-meta">
            <Badge tone="success">FACTURA FEL</Badge>
            <strong>No. SM-{dteNumber}</strong>
            <span>Fecha: {formattedDateTime}</span>
          </div>
        </div>
        <div className="invoice-company">
          <div>
            <strong>SoloMotos Quetzaltenango</strong>
            <span>NIT: 8214573-6</span>
            <span>7a. calle 4-63, zona 2, Quetzaltenango</span>
            <span>Tel. +502 7765 4321</span>
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
                <small>{item.cat}</small>
              </span>
              <span>{formatQuetzales(item.price)}</span>
              <span><strong>{formatQuetzales(item.qty * item.price)}</strong></span>
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
        <div className="fel-block">
          <div className="fel-title">
            <Icon name="file" size="sm" /> Datos de certificación FEL
          </div>
          <div className="fel-grid">
            <div>
              <span>Serie</span>
              <strong>{series}</strong>
            </div>
            <div>
              <span>Número de DTE</span>
              <strong>{dteNumber}</strong>
            </div>
            <div className="fel-uuid">
              <span>Número de autorización</span>
              <strong>{uuid}</strong>
            </div>
            <div>
              <span>Fecha y hora de certificación</span>
              <strong>{formattedDateTime}</strong>
            </div>
          </div>
        </div>
        <div className="invoice-footer">
          <span>Gracias por preferir SoloMotos.</span>
          <span>Documento tributario electrónico autorizado por la SAT.</span>
        </div>
      </div>
    </div>
  );
}
