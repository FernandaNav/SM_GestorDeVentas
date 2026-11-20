import { useEffect } from "react";
import type { ProductOption, ProductUnit } from "@shared/schemas/inventory";
import { inventoryApi } from "@/api/inventory";
import { useCatalog } from "@/catalog/CatalogContext";
import MoneyInput from "@/components/MoneyInput";
import ProductPicker from "@/components/ProductPicker";
import { Icon, Select } from "@/components/ui";
import { formatQuetzales } from "@/lib/format";

/** Una fila del formulario de venta, como se está escribiendo. */
export type SaleItem = {
  id: number;
  desc: string;
  cat: string;
  qty: number;
  price: number;
  /** Producto del inventario elegido en el buscador; sin él la línea es libre */
  productId?: number;
  /** Existencias del producto al elegirlo, para avisar antes de vender de más */
  stock?: number;
  /** Moto: se elige una unidad (chasis) de `units` y la cantidad queda en 1 */
  tracksUnits?: boolean;
  units?: ProductUnit[];
  unitId?: number;
};

const CHOOSE_UNIT = "";

/** Lo que falta resolver en las líneas del inventario antes de confirmar; null = todo bien. */
export function inventoryProblem(items: SaleItem[]): string | null {
  for (const item of items) {
    if (!item.productId) continue;
    if (item.tracksUnits && !item.unitId) return `Elige el número de chasis de "${item.desc}"`;
    if (!item.tracksUnits && item.stock !== undefined && item.qty > item.stock) return `Solo quedan ${item.stock} de "${item.desc}"`;
  }
  return null;
}

export default function ItemsTable({
  items,
  setItems,
}: {
  items: SaleItem[];
  setItems: (update: SaleItem[] | ((current: SaleItem[]) => SaleItem[])) => void;
}) {
  const { categories, categoryNames } = useCatalog();
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
    if (items.every((item) => item.productId || categoryNames.includes(item.cat))) return;
    setItems(items.map((item) => (item.productId || categoryNames.includes(item.cat) ? item : { ...item, cat: defaultCategory })));
  }, [categoryNames, items, setItems, defaultCategory]);

  const patchItem = (id: number, patch: Partial<SaleItem>) => {
    setItems(items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  // Elegir un producto llena la línea con sus datos; el precio sugerido se puede cambiar
  const pickProduct = async (id: number, option: ProductOption) => {
    const category = categories.find((c) => c.id === option.categoryId);
    const picked: Partial<SaleItem> = {
      desc: option.name,
      cat: category?.name ?? defaultCategory,
      price: option.salePrice,
      productId: option.id,
      stock: option.stock,
      tracksUnits: option.tracksUnits,
      units: undefined,
      unitId: undefined,
      ...(option.tracksUnits && { qty: 1 }),
    };
    patchItem(id, picked);
    if (option.tracksUnits) {
      const units = await inventoryApi.availableUnits(option.id).catch(() => []);
      // Sobre la lista actual (la persona pudo seguir escribiendo mientras llegaban las motos),
      // y solo si la línea sigue siendo de ese producto
      setItems((current) => current.map((item) => (item.id === id && item.productId === option.id ? { ...item, units } : item)));
    }
  };

  const unlink = (id: number) =>
    patchItem(id, { productId: undefined, stock: undefined, tracksUnits: undefined, units: undefined, unitId: undefined });

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
            const short = !item.tracksUnits && item.stock !== undefined && item.qty > item.stock;
            return (
              <tr key={item.id}>
                <td>
                  <ProductPicker
                    value={item.desc}
                    linked={Boolean(item.productId)}
                    onChange={(desc) => patchItem(item.id, { desc })}
                    onPick={(option) => pickProduct(item.id, option)}
                  />
                  {item.productId && (
                    <div className="item-stock">
                      <span className="tag">
                        <Icon name="box" size="sm" /> Inventario
                      </span>
                      {item.tracksUnits ? (
                        <span className="unit-select">
                          <Select
                            compact
                            ariaLabel="Número de chasis"
                            value={item.unitId ? String(item.unitId) : CHOOSE_UNIT}
                            options={[
                              { value: CHOOSE_UNIT, label: item.units ? (item.units.length > 0 ? "Elige el chasis" : "Sin motos disponibles") : "Cargando chasis..." },
                              ...(item.units ?? []).map((unit) => ({ value: String(unit.id), label: unit.serial })),
                            ]}
                            onChange={(value) => patchItem(item.id, { unitId: value ? Number(value) : undefined })}
                          />
                        </span>
                      ) : (
                        <span className={short ? "is-short" : undefined}>{short ? `Solo quedan ${item.stock}` : `Quedan ${item.stock}`}</span>
                      )}
                      <button type="button" className="unlink" onClick={() => unlink(item.id)}>
                        Quitar del inventario
                      </button>
                    </div>
                  )}
                </td>
                <td>
                  {/* Con producto, la categoría la pone el inventario */}
                  {item.productId ? (
                    <span className="cell-locked">{item.cat}</span>
                  ) : (
                    <Select compact ariaLabel="Categoría" value={item.cat} options={categoryNames} onChange={(value) => patchItem(item.id, { cat: value })} />
                  )}
                </td>
                <td>
                  <input
                    className="cell-input narrow"
                    type="number"
                    min={1}
                    value={item.qty}
                    disabled={item.tracksUnits}
                    title={item.tracksUnits ? "Cada moto va en su propia línea" : undefined}
                    onChange={(e) => patchItem(item.id, { qty: Math.max(1, Number(e.target.value)) })}
                  />
                </td>
                <td>
                  <MoneyInput value={item.price} onChange={(price) => patchItem(item.id, { price })} ariaLabel="Precio unitario" />
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
