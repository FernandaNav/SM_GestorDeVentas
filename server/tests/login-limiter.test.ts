// Límite de intentos de login, con un reloj de prueba. No necesita base de datos.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createLoginLimiter } from "../src/lib/login-limiter";

const MINUTE = 60_000;

function setup() {
  let time = 0;
  const limiter = createLoginLimiter(() => time);
  const fail = (key: string, times: number) => {
    for (let i = 0; i < times; i++) limiter.recordFailure(key);
  };
  return { limiter, fail, advance: (ms: number) => (time += ms) };
}

describe("límite de intentos de login", () => {
  it("permite hasta cuatro fallos y bloquea al quinto", () => {
    const { limiter, fail } = setup();
    fail("pc:Empleado", 4);
    assert.doesNotThrow(() => limiter.assertAllowed("pc:Empleado"));
    fail("pc:Empleado", 1);
    assert.throws(() => limiter.assertAllowed("pc:Empleado"), { status: 429 });
  });

  it("dice cuánto falta y se libera a los 15 minutos", () => {
    const { limiter, fail, advance } = setup();
    fail("pc:Empleado", 5);
    assert.throws(() => limiter.assertAllowed("pc:Empleado"), /en 15 minutos/);
    advance(14 * MINUTE);
    assert.throws(() => limiter.assertAllowed("pc:Empleado"), /en 1 minuto$/);
    advance(MINUTE);
    assert.doesNotThrow(() => limiter.assertAllowed("pc:Empleado"));
  });

  it("un login correcto borra los fallos anteriores", () => {
    const { limiter, fail } = setup();
    fail("pc:Empleado", 4);
    limiter.recordSuccess("pc:Empleado");
    fail("pc:Empleado", 4);
    assert.doesNotThrow(() => limiter.assertAllowed("pc:Empleado"));
  });

  it("los fallos viejos no se acumulan con los nuevos", () => {
    const { limiter, fail, advance } = setup();
    fail("pc:Empleado", 4);
    advance(16 * MINUTE);
    fail("pc:Empleado", 1);
    assert.doesNotThrow(() => limiter.assertAllowed("pc:Empleado"));
  });

  it("cuenta por separado cada computadora y cada rol", () => {
    const { limiter, fail } = setup();
    fail("pc1:Empleado", 5);
    assert.doesNotThrow(() => limiter.assertAllowed("pc2:Empleado"));
    assert.doesNotThrow(() => limiter.assertAllowed("pc1:Administrador"));
  });
});
