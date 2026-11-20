import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import type { ProductOption } from "@shared/schemas/inventory";
import { inventoryApi } from "@/api/inventory";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { formatQuetzales } from "@/lib/format";

const MIN_CHARS = 2;
const SEARCH_DELAY_MS = 250;

/**
 * Campo de descripción que también busca en el inventario (nombre, código o chasis).
 * Escribir sin elegir deja la línea libre, como siempre; elegir un producto la conecta al
 * inventario. Mientras la línea está conectada (`linked`) ya no busca.
 * La lista se dibuja sobre la página (portal) para que no la recorte la tabla con scroll.
 */
export default function ProductPicker({
  value,
  onChange,
  onPick,
  linked,
  partsOnly = false,
  placeholder,
  disabled = false,
}: {
  value: string;
  onChange: (text: string) => void;
  onPick: (option: ProductOption) => void;
  linked: boolean;
  /** Taller: las motos (por chasis) no se pueden usar como repuesto */
  partsOnly?: boolean;
  placeholder?: string;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const [options, setOptions] = useState<ProductOption[]>([]);
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const query = useDebouncedValue(value.trim(), SEARCH_DELAY_MS);
  const searching = focused && !linked && !disabled && query.length >= MIN_CHARS;

  useEffect(() => {
    if (!searching) {
      setOptions([]);
      return;
    }
    let current = true;
    inventoryApi
      .search(query)
      .then((found) => {
        if (!current) return;
        setOptions(partsOnly ? found.filter((option) => !option.tracksUnits) : found);
        setActive(0);
      })
      .catch(() => current && setOptions([]));
    return () => {
      current = false;
    };
  }, [searching, query, partsOnly]);

  const open = searching && options.length > 0;

  // La lista se coloca bajo el campo y lo sigue si la página o la ventana se mueven
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = inputRef.current?.getBoundingClientRect();
      if (rect) setPosition({ top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 340) });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, options]);

  const pick = (option: ProductOption) => {
    if (option.stock === 0) return;
    onPick(option);
    setOptions([]);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!open) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => Math.min(options.length - 1, index + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(0, index - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      pick(options[active]);
    } else if (event.key === "Escape") {
      setOptions([]);
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        className="cell-input wide"
        value={value}
        disabled={disabled}
        placeholder={placeholder ?? "Busca en el inventario o escribe..."}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => setFocused(true)}
        // Espera un momento antes de cerrar para que el clic en una opción alcance a contar
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        onKeyDown={handleKeyDown}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
      />
      {open &&
        position &&
        createPortal(
          <ul className="product-picker" role="listbox" style={{ top: position.top, left: position.left, width: position.width }}>
            {options.map((option, index) => (
              <li
                key={option.id}
                role="option"
                aria-selected={index === active}
                aria-disabled={option.stock === 0}
                className={`product-option${index === active ? " is-active" : ""}${option.stock === 0 ? " is-out" : ""}`}
                onMouseEnter={() => setActive(index)}
                onMouseDown={(event) => {
                  event.preventDefault();
                  pick(option);
                }}
              >
                <span className="product-option-main">
                  <strong>{option.name}</strong>
                  <span className="muted small">{[option.code, option.tracksUnits && "Por chasis"].filter(Boolean).join(" · ")}</span>
                </span>
                <span className="product-option-side">
                  <strong>{formatQuetzales(option.salePrice)}</strong>
                  <span className={option.stock === 0 ? "stock-out" : "muted small"}>
                    {option.stock === 0 ? "Agotado" : option.tracksUnits ? `${option.stock} disponibles` : `Quedan ${option.stock}`}
                  </span>
                </span>
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </>
  );
}
