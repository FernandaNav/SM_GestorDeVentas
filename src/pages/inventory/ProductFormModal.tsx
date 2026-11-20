import { useState } from "react";
import { productInputSchema, type Product } from "@shared/schemas/inventory";
import { ApiError } from "@/api/client";
import { inventoryApi } from "@/api/inventory";
import { useCatalog } from "@/catalog/CatalogContext";
import { FormError, Modal, Select, TextInput, Toggle } from "@/components/ui";
import { issuesToErrors } from "@/lib/validation";
import { toAmount } from "./inventoryFormat";

/** Las categorías de motos se controlan por unidad (chasis) de forma predeterminada. */
const isMotoCategory = (name: string) => name.toLowerCase().startsWith("moto");

/** Alta o edición de un producto. `product` = null para uno nuevo. */
export default function ProductFormModal({ product, onClose, onSaved }: { product: Product | null; onClose: () => void; onSaved: (saved: Product) => void }) {
  const { categories } = useCatalog();
  // Si el producto conserva una categoría que se desactivó, sigue apareciendo para no cambiarla sin querer
  const options = product && !categories.some((c) => c.id === product.categoryId)
    ? [...categories, { id: product.categoryId, name: product.categoryName, isActive: false, defaultCommissionRate: null }]
    : categories;

  const [name, setName] = useState(product?.name ?? "");
  const [code, setCode] = useState(product?.code ?? "");
  const [categoryId, setCategoryId] = useState<number | null>(product?.categoryId ?? null);
  const [salePrice, setSalePrice] = useState(product ? String(product.salePrice) : "");
  const [cost, setCost] = useState(product?.cost != null ? String(product.cost) : "");
  const [minStock, setMinStock] = useState(product ? String(product.minStock) : "0");
  const [tracksUnits, setTracksUnits] = useState(product?.tracksUnits ?? false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const unitsLocked = Boolean(product?.hasMovements);

  const chooseCategory = (categoryName: string) => {
    const chosen = options.find((c) => c.name === categoryName);
    if (!chosen) return;
    setCategoryId(chosen.id);
    // Al crear, sugerir el control por chasis para las motos (se puede cambiar)
    if (!product) setTracksUnits(isMotoCategory(chosen.name));
  };

  const handleSave = async () => {
    const parsed = productInputSchema.safeParse({
      name,
      code,
      categoryId: categoryId ?? undefined,
      salePrice: toAmount(salePrice),
      cost: cost.trim() === "" ? null : toAmount(cost),
      minStock: minStock.trim() === "" ? undefined : Number(minStock),
      tracksUnits,
    });
    if (!parsed.success) {
      setErrors(issuesToErrors(parsed.error.issues));
      return;
    }
    setSaving(true);
    setErrors({});
    try {
      const saved = product ? await inventoryApi.update(product.id, parsed.data) : await inventoryApi.create(parsed.data);
      onSaved(saved);
    } catch (err) {
      setErrors(err instanceof ApiError ? { ...err.fields, _form: err.message } : { _form: "No se pudo guardar el producto" });
    } finally {
      setSaving(false);
    }
  };

  const categoryName = options.find((c) => c.id === categoryId)?.name ?? "";

  return (
    <Modal
      open
      title={product ? "Editar producto" : "Nuevo producto"}
      onClose={onClose}
      onConfirm={handleSave}
      confirmLabel={saving ? "Guardando..." : product ? "Guardar cambios" : "Agregar producto"}
      confirmDisabled={saving}
    >
      <div className="vertical-form" style={{ marginTop: 0 }}>
        {errors._form && <FormError message={errors._form} />}
        <TextInput label="Nombre" placeholder="Ej. Casco LS2 Stream Evo" value={name} onChange={setName} error={errors.name} />
        <div className="form-grid two">
          <TextInput label="Código (opcional)" placeholder="Ej. CAS-001" value={code} onChange={setCode} error={errors.code} />
          <div className="field">
            <Select label="Categoría" value={categoryName} options={options.map((c) => c.name)} onChange={chooseCategory} />
            {errors.categoryId && <span className="field-error">{errors.categoryId}</span>}
          </div>
        </div>
        <div className="form-grid three">
          <TextInput label="Precio de venta" placeholder="Q 0.00" value={salePrice} onChange={setSalePrice} error={errors.salePrice} />
          <TextInput label="Costo (opcional)" placeholder="Q 0.00" value={cost} onChange={setCost} error={errors.cost} />
          <TextInput label="Existencia mínima" placeholder="0" value={minStock} onChange={setMinStock} error={errors.minStock} />
        </div>
        <div className="field">
          <Toggle
            checked={tracksUnits}
            onChange={(checked) => !unitsLocked && setTracksUnits(checked)}
            label="Se controla por unidad (número de chasis)"
          />
          <span className="muted small">
            {unitsLocked
              ? "Ya tiene movimientos: esta opción no se puede cambiar."
              : tracksUnits
                ? "Cada unidad se registra con su chasis y se elige al vender. Ideal para motos."
                : "Se controla por cantidad, como cascos, repuestos o aceites."}
          </span>
        </div>
        <div className="notice">
          El precio es el sugerido: al vender se puede cobrar otro. Con la existencia mínima, el producto avisa cuando quedan pocas.
        </div>
      </div>
    </Modal>
  );
}
