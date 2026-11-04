import { useState } from "react";

/** Deja solo dígitos, un punto y dos decimales: "1,250.505" → "1250.50" (RNF 8.1). */
function sanitize(raw: string): string {
  const [integer, ...decimals] = raw.replace(/[^0-9.]/g, "").split(".");
  return decimals.length ? `${integer}.${decimals.join("").slice(0, 2)}` : integer;
}

const toAmount = (text: string) => Number(text) || 0;

/**
 * Campo de monto que guarda lo escrito como texto. Si guardara solo el número, al teclear
 * "12." el punto se perdería (12) y "12.50" terminaría siendo 1250.
 */
export default function MoneyInput({
  value,
  onChange,
  ariaLabel,
}: {
  value: number;
  onChange: (amount: number) => void;
  ariaLabel?: string;
}) {
  const [text, setText] = useState("");
  // Si el monto cambió desde afuera (reiniciar la venta, cargar una edición) se muestra el nuevo
  const shown = toAmount(text) === value ? text : value === 0 ? "" : String(value);

  return (
    <input
      className="cell-input"
      inputMode="decimal"
      aria-label={ariaLabel}
      placeholder="0.00"
      value={shown}
      onChange={(event) => {
        const clean = sanitize(event.target.value);
        setText(clean);
        onChange(toAmount(clean));
      }}
    />
  );
}
