import { useCatalog } from "@/catalog/CatalogContext";
import { Icon } from "@/components/ui";
import { formatQuetzales } from "@/lib/format";
import type { SaleItem } from "@/temporal/localStore";

export default function ItemsTable({
  items,
  setItems,
  isAdmin,
}: {
  items: SaleItem[];
  setItems: (items: SaleItem[]) => void;
  isAdmin: boolean;
}) {
  const { categoryNames, defaultCommissions } = useCatalog();
  const updateItem = (id: number, field: keyof SaleItem, val: string | number) => {
    setItems(
      items.map((item) => {
        if (item.id !== id) return item;
        const updated = { ...item, [field]: val };
        if (field === "cat") updated.commission = defaultCommissions[val as string] ?? "";
        return updated;
      })
    );
  };

  const addItem = () => {
    setItems([
      ...items,
      { id: Date.now(), desc: "", cat: "Accesorio", qty: 1, price: 0, commission: "2.5" },
    ]);
  };

  const removeItem = (id: number) => {
    if (items.length <= 1) {
      setItems([{ id: Date.now(), desc: "", cat: "Accesorio", qty: 1, price: 0, commission: "2.5" }]);
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
            {isAdmin && <th>Comisión %</th>}
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
                  <select
                    className="cell-select"
                    value={item.cat}
                    onChange={(e) => updateItem(item.id, "cat", e.target.value)}
                  >
                    {categoryNames.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
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
                  <input
                    className="cell-input"
                    value={item.price === 0 ? "" : item.price.toString()}
                    onChange={(e) => updateItem(item.id, "price", Number(e.target.value.replace(/[^0-9.]/g, "")))}
                    placeholder="0.00"
                  />
                </td>
                <td className="cell-amount">{formatQuetzales(subtotal)}</td>
                {isAdmin && (
                  <td>
                    <div className="comm-cell">
                      {item.commission !== "" ? (
                        <input
                          className="cell-input narrow"
                          value={item.commission}
                          onChange={(e) => updateItem(item.id, "commission", e.target.value)}
                        />
                      ) : (
                        <span className="badge badge-neutral">Pendiente</span>
                      )}
                    </div>
                  </td>
                )}
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
