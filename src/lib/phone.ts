const COUNTRY_CODE = "502";
const LOCAL_DIGITS = 8;

const groupLocal = (digits: string) => [digits.slice(0, 4), digits.slice(4)].filter(Boolean).join(" ");

/**
 * Teléfono para mostrar: 12123434 → 1212 3434 y +50255123344 → +502 5512 3344.
 * Lo que no parece un número de Guatemala se deja como está, para no perder dígitos.
 */
export function formatPhone(raw: string): string {
  const text = raw.trim();
  const digits = text.replace(/\D/g, "");
  const isInternational = text.startsWith("+") || (digits.length === COUNTRY_CODE.length + LOCAL_DIGITS && digits.startsWith(COUNTRY_CODE));

  if (isInternational) {
    if (!digits.startsWith(COUNTRY_CODE)) return `+${digits}`;
    const local = digits.slice(COUNTRY_CODE.length);
    if (local.length > LOCAL_DIGITS) return text;
    return local ? `+${COUNTRY_CODE} ${groupLocal(local)}` : `+${COUNTRY_CODE}`;
  }
  return digits.length <= LOCAL_DIGITS ? groupLocal(digits) : text;
}

/** Máscara mientras se escribe: acomoda el número, ignora letras y no deja pasar del largo válido. */
export function maskPhoneInput(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (raw.trim().startsWith("+")) {
    const limit = digits.startsWith(COUNTRY_CODE) ? COUNTRY_CODE.length + LOCAL_DIGITS : 14;
    return formatPhone(`+${digits.slice(0, limit)}`);
  }
  const isFullWithCountry = digits.length === COUNTRY_CODE.length + LOCAL_DIGITS && digits.startsWith(COUNTRY_CODE);
  return formatPhone(isFullWithCountry ? digits : digits.slice(0, LOCAL_DIGITS));
}
