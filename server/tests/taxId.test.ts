// Máscaras de NIT y CUI. No necesitan base de datos.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { saleClientSchema } from "../../shared/schemas/sales";
import { formatTaxId } from "../../src/lib/taxId";

/** Lo que queda en el campo al teclear caracter por caracter, como lo hace una persona. */
const typed = (type: "NIT" | "CUI", keys: string) => [...keys].reduce((field, key) => formatTaxId(type, field + key), "");

describe("máscaras de NIT y CUI", () => {
  const cases: [string, "NIT" | "CUI", string, string][] = [
    ["NIT con guion antes del verificador", "NIT", "54896321", "5489632-1"],
    ["NIT ya escrito con guion", "NIT", "5489632-1", "5489632-1"],
    ["NIT con K minúscula", "NIT", "1234567k", "1234567-K"],
    ["NIT sin letras ni signos", "NIT", "12a3$4", "123-4"],
    ["NIT: la K solo vale al final", "NIT", "12K34", "123-4"],
    ["NIT limitado a 13 caracteres", "NIT", "123456789012345", "123456789012-3"],
    ["CUI agrupado", "CUI", "2345123450101", "2345 12345 0101"],
    ["CUI ya escrito con espacios", "CUI", "2345 12345 0101", "2345 12345 0101"],
    ["CUI parcial", "CUI", "23451", "2345 1"],
    ["CUI sin letras", "CUI", "23k45", "2345"],
    ["CUI limitado a 13 dígitos", "CUI", "23451234501019999", "2345 12345 0101"],
    ["Consumidor Final en minúsculas", "NIT", "cf", "CF"],
  ];

  for (const [name, type, input, expected] of cases) {
    it(name, () => assert.equal(formatTaxId(type, input), expected));
  }

  it("el resultado de pegar y de teclear es el mismo", () => {
    assert.equal(typed("NIT", "54896321"), "5489632-1");
    assert.equal(typed("NIT", "1234567K"), "1234567-K");
    assert.equal(typed("CUI", "2345123450101"), "2345 12345 0101");
    assert.equal(typed("NIT", "CF"), "CF");
  });

  it("borrar de uno en uno no se traba en el guion ni en los espacios", () => {
    const erase = (type: "NIT" | "CUI", start: string) => {
      let field = start;
      for (let i = 0; i < 30 && field; i++) field = formatTaxId(type, field.slice(0, -1));
      return field;
    };
    assert.equal(erase("NIT", "5489632-1"), "");
    assert.equal(erase("CUI", "2345 12345 0101"), "");
  });

  it("lo que produce la máscara lo acepta la validación del servidor", () => {
    const valid = (taxIdType: "NIT" | "CUI", taxId: string) => saleClientSchema.safeParse({ taxIdType, taxId, name: "Cliente" }).success;
    assert.ok(valid("NIT", formatTaxId("NIT", "54896321")));
    assert.ok(valid("NIT", formatTaxId("NIT", "1234567k")));
    assert.ok(valid("CUI", formatTaxId("CUI", "2345123450101")));
  });
});
