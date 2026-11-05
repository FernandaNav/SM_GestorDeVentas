// Formato de teléfonos del personal. No necesita base de datos.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { staffInputSchema } from "../../shared/schemas/staff";
import { formatPhone, maskPhoneInput } from "../../src/lib/phone";

/** Lo que queda en el campo al teclear caracter por caracter. */
const typed = (keys: string) => [...keys].reduce((field, key) => maskPhoneInput(field + key), "");
const phoneIsValid = (phone: string) => staffInputSchema.safeParse({ fullName: "Luisa Ajú", type: "Vendedor", phone }).success;

describe("teléfonos", () => {
  const display: [string, string][] = [
    ["12123434", "1212 3434"],
    ["5512-3344", "5512 3344"],
    ["5512 3344", "5512 3344"],
    ["+50255123344", "+502 5512 3344"],
    ["50255123344", "+502 5512 3344"],
    ["+1 305 555 0100", "+13055550100"],
    ["1234567890", "1234567890"],
  ];
  for (const [saved, shown] of display) {
    it(`muestra ${saved} como ${shown}`, () => assert.equal(formatPhone(saved), shown));
  }

  it("acomoda el número mientras se escribe", () => {
    assert.equal(typed("1212"), "1212");
    assert.equal(typed("12123"), "1212 3");
    assert.equal(typed("12123434"), "1212 3434");
    assert.equal(typed("+50255123344"), "+502 5512 3344");
  });

  it("ignora letras y no deja pasar de 8 dígitos", () => {
    assert.equal(typed("12a12b3434"), "1212 3434");
    assert.equal(typed("121234349999"), "1212 3434");
  });

  it("se puede borrar de uno en uno sin trabarse en el espacio", () => {
    let field = "+502 5512 3344";
    for (let i = 0; i < 20 && field; i++) field = maskPhoneInput(field.slice(0, -1));
    assert.equal(field, "");
  });

  it("no pierde dígitos al pegar un número con código de país", () => {
    assert.equal(maskPhoneInput("50255123344"), "+502 5512 3344");
  });

  it("el servidor acepta lo que produce la máscara y rechaza un número incompleto", () => {
    assert.ok(phoneIsValid(typed("12123434")));
    assert.ok(phoneIsValid(typed("+50255123344")));
    assert.ok(phoneIsValid(""));
    assert.equal(phoneIsValid(typed("1212343")), false, "1212 343 tiene 8 caracteres pero solo 7 dígitos");
  });
});
