import { Badge, Button, Icon } from "@/components/ui";
import { formatQuetzales } from "@/lib/format";

export type RecentSaleRow = {
  id: string;
  time: string;
  product: string;
  category: string;
  seller: string;
  paymentMethod: string;
  amount: number;
  commission: string;
  isInvoiced: boolean;
  invoiceStatus: "Facturada" | "No facturada";
};

export default function SalesTable({
  compact = false,
  salesData,
  onNewSale,
}: {
  compact?: boolean;
  salesData?: RecentSaleRow[];
  onNewSale?: () => void;
}) {
  if (!salesData || salesData.length === 0) {
    return (
      <div className="empty-state-box">
        <div className="empty-state-icon">
          <Icon name="receipt" />
        </div>
        <div className="empty-state-title">No hay ventas registradas aún</div>
        <div className="empty-state-desc">Las ventas que registres se mostrarán aquí en tiempo real.</div>
        {onNewSale && (
          <Button icon="plus" onClick={onNewSale}>
            Registrar primera venta
          </Button>
        )}
      </div>
    );
  }

  const list = salesData.slice(0, compact ? 3 : 5);
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Fecha / Hora</th>
            <th>Producto</th>
            <th>Vendedor</th>
            <th>Monto</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {list.map((row) => (
            <tr key={row.id}>
              <td>{row.time}</td>
              <td><strong>{row.product}</strong></td>
              <td>{row.seller}</td>
              <td><strong>{formatQuetzales(row.amount)}</strong></td>
              <td>
                <Badge tone={row.isInvoiced ? "success" : "neutral"}>
                  {row.invoiceStatus}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
