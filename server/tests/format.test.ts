// Monto en letras de la factura. No necesita base de datos.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { numberToWords } from "../../src/lib/format";

describe("monto en letras", () => {
  const cases: [number, string][] = [
    [0, "Cero quetzales con 00/100"],
    [1, "Un quetzal con 00/100"],
    [1.5, "Un quetzal con 50/100"],
    [21, "Veintiún quetzales con 00/100"],
    [22, "Veintidós quetzales con 00/100"],
    [26, "Veintiséis quetzales con 00/100"],
    [31, "Treinta y un quetzales con 00/100"],
    [100, "Cien quetzales con 00/100"],
    [101, "Ciento un quetzales con 00/100"],
    [1000, "Mil quetzales con 00/100"],
    [1250.5, "Mil doscientos cincuenta quetzales con 50/100"],
    [21000, "Veintiún mil quetzales con 00/100"],
    [21500, "Veintiún mil quinientos quetzales con 00/100"],
    [31000, "Treinta y un mil quetzales con 00/100"],
    [101000, "Ciento un mil quetzales con 00/100"],
    [121021.05, "Ciento veintiún mil veintiún quetzales con 05/100"],
    [1000000, "Un millón de quetzales con 00/100"],
    [2000000, "Dos millones de quetzales con 00/100"],
    [1250000.99, "Un millón doscientos cincuenta mil quetzales con 99/100"],
    [21000000, "Veintiún millones de quetzales con 00/100"],
  ];

  for (const [amount, expected] of cases) {
    it(`${amount} → ${expected}`, () => assert.equal(numberToWords(amount), expected));
  }
});
