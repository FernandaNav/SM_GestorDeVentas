import { useEffect } from "react";
import { useCatalog } from "@/catalog/CatalogContext";
import MoneyInput from "@/components/MoneyInput";
import { Icon, Select } from "@/components/ui";
import { formatQuetzales } from "@/lib/format";

/** Una fila del formulario de venta, como se está escribiendo. */
export type SaleItem = {
  id: number;
  desc: string;
  cat: string;
  qty: number;
  price: number;
};

export default function ItemsTable({
  items,
  setItems,
}: {
  items: SaleItem[];
  setItems: (items: SaleItem[]) => void;
}) {
  const { categoryNames } = useCatalog();
  // Accesorio es lo más común en mostrador; si se desactivó, la primera categoría activa
  const defaultCategory = categoryNames.includes("Accesorio") ? "Accesorio" : (categoryNames[0] ?? "");
  const blankItem = (): SaleItem => ({
    id: Date.now(),
    desc: "",
    cat: defaultCategory,
    qty: 1,
    price: 0,
  });

  // Una fila nueva (sin categoría) o con una categoría que ya no está activa toma la de por
  // defecto, para no enviar una que el servidor rechazaría.
  useEffect(() => {
    if (categoryNames.length === 0) return;
    if (items.every((item) => categoryNames.includes(item.cat))) return;
    setItems(items.map((item) => (categoryNames.includes(item.cat) ? item : { ...item, cat: defaultCategory })));
  }, [categoryNames, items, setItems, defaultCategory]);

  const updateItem = (id: number, field: keyof SaleItem, val: string | number) => {
    setItems(items.map((item) => (item.id === id ? { ...item, [field]: val } : item)));
  };

  const addItem = () => {
    setItems([...items, blankItem()]);
  };

  const removeItem = (id: number) => {
    if (items.length <= 1) {
      setItems([blankItem()]);
      return;
    }
    setItems(items.filter((i) => i.id !== id));
  };

  return (
    <div className="items-table-wrap">
      <table className="items-table">
        <thead>
          <tr>
            <th>Descripción</th>
            <th>Categoría</th>
            <th>Cant.</th>
            <th>Precio unit.</th>
            <th>Subtotal</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const subtotal = item.qty * item.price;
            return (
              <tr key={item.id}>
                <td>
                  <input
                    className="cell-input wide"
                    value={item.desc}
                    onChange={(e) => updateItem(item.id, "desc", e.target.value)}
                    placeholder="Descripción del artículo..."
                  />
                </td>
                <td>
                  <Select compact ariaLabel="Categoría" value={item.cat} options={categoryNames} onChange={(value) => updateItem(item.id, "cat", value)} />
                </td>
                <td>
                  <input
                    className="cell-input narrow"
                    type="number"
                    min={1}
                    value={item.qty}
                    onChange={(e) => updateItem(item.id, "qty", Math.max(1, Number(e.target.value)))}
                  />
                </td>
                <td>
                  <MoneyInput value={item.price} onChange={(price) => updateItem(item.id, "price", price)} ariaLabel="Precio unitario" />
                </td>
                <td className="cell-amount">{formatQuetzales(subtotal)}</td>
                <td>
                  <button type="button" className="icon-button" onClick={() => removeItem(item.id)} aria-label="Quitar">
                    <Icon name="trash" size="sm" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button type="button" className="add-item-btn" onClick={addItem}>
        <Icon name="plus" size="sm" />
        <span>Agregar artículo</span>
      </button>
    </div>
  );
}
