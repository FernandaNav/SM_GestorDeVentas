/** Monto para los textos de bitácora: 1250.5 → "Q1,250.50". */
export const formatMoney = (amount: number) =>
  "Q" + amount.toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
