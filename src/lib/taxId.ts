// Máscaras de NIT y CUI (RNF 8.1): acomodan el dato mientras se escribe y no dejan poner
// caracteres inválidos. Que el dato esté completo lo sigue validando saleClientSchema.

/** Solo dígitos, con K permitida al final, y guion antes del dígito verificador: 54896321 → 5489632-1 */
function formatNit(value: string): string {
  const chars = value.replace(/[^0-9K]/g, "").slice(0, 13);
  if (chars.length < 2) return chars;
  const body = chars.slice(0, -1).replace(/K/g, "");
  const verifier = chars[chars.length - 1];
  return body ? `${body}-${verifier}` : verifier;
}

/** 13 dígitos en grupos de 4, 5 y 4: 2345123450101 → 2345 12345 0101 */
function formatCui(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 13);
  return [digits.slice(0, 4), digits.slice(4, 9), digits.slice(9)].filter(Boolean).join(" ");
}

/** "C" y "CF" se respetan para poder escribir Consumidor Final en el mismo campo. */
export function formatTaxId(type: "NIT" | "CUI", raw: string): string {
  const value = raw.trim().toUpperCase();
  if (value === "C" || value === "CF") return value;
  return type === "CUI" ? formatCui(value) : formatNit(value);
}
