// Formatos de texto, montos y fechas que usan varias pantallas.

export const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export function formatQuetzales(amount: number): string {
  return "Q " + amount.toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export const LONG_DATE_FORMAT = new Intl.DateTimeFormat("es-GT", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
export const SHORT_DATE_FORMAT = new Intl.DateTimeFormat("es-GT", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
export const SALE_DATE_FORMAT = new Intl.DateTimeFormat("es-GT", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
export const SALE_TIME_FORMAT = new Intl.DateTimeFormat("es-GT", { hour: "2-digit", minute: "2-digit", hour12: false });

// ─── monto en letras (para la factura) ──────────────────────────────────────

const ONES = ["", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez", "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve"];
const TENS = ["", "", "veinte", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
const HUNDREDS = ["", "cien", "doscientos", "trescientos", "cuatrocientos", "quinientos", "seiscientos", "setecientos", "ochocientos", "novecientos"];

function intToWords(value: number): string {
  if (value === 0) return "cero";
  if (value < 20) return ONES[value];
  if (value < 100) {
    const tens = Math.floor(value / 10);
    const ones = value % 10;
    return tens === 2 && ones > 0 ? "veinti" + ONES[ones] : TENS[tens] + (ones ? " y " + ONES[ones] : "");
  }
  if (value === 100) return "cien";
  if (value < 1000) {
    const hundreds = Math.floor(value / 100);
    const remainder = value % 100;
    return (hundreds === 1 ? "ciento" : HUNDREDS[hundreds]) + (remainder ? " " + intToWords(remainder) : "");
  }
  if (value < 2000) {
    const remainder = value % 1000;
    return "mil" + (remainder ? " " + intToWords(remainder) : "");
  }
  if (value < 1000000) {
    const thousands = Math.floor(value / 1000);
    const remainder = value % 1000;
    return intToWords(thousands) + " mil" + (remainder ? " " + intToWords(remainder) : "");
  }
  return value.toString();
}

/** 1250.5 → "Mil doscientos cincuenta quetzales con 50/100" */
export function numberToWords(amount: number): string {
  const integerPart = Math.floor(amount);
  const decimalPart = Math.round((amount - integerPart) * 100);
  return capitalize(intToWords(integerPart)) + ` quetzales con ${decimalPart.toString().padStart(2, "0")}/100`;
}
