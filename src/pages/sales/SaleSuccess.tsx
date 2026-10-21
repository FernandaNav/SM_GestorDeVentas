import { Button, Icon } from "@/components/ui";
import { formatQuetzales } from "@/lib/format";

export default function SaleSuccess({
  total,
  onNewSale,
  onHistory,
}: {
  total: number;
  onNewSale: () => void;
  onHistory: () => void;
}) {
  return (
    <div className="success-full">
      <div className="success-icon">
        <Icon name="check" />
      </div>
      <div className="success-title">Venta registrada correctamente</div>
      <div className="success-sub success-no-invoice">(sin factura)</div>
      <div className="success-amount">{formatQuetzales(total)}</div>
      <div className="success-actions">
        <Button onClick={onNewSale}>Registrar otra venta</Button>
        <Button variant="secondary" onClick={onHistory}>Ver ventas</Button>
      </div>
    </div>
  );
}
