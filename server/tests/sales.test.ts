// Pruebas de ventas contra una base PostgreSQL real, pasando por la API completa.
// Uso: define TEST_DATABASE_URL (ver .env.example) y corre `pnpm test`.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import dotenv from "dotenv";

dotenv.config({ quiet: true });

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

/** Estas pruebas borran toda la base: solo se acepta una local cuyo nombre termine en _test. */
function assertSafeToErase(url: string) {
  const { hostname, pathname } = new URL(url);
  if (hostname !== "localhost" || !pathname.endsWith("_test")) {
    throw new Error("TEST_DATABASE_URL debe apuntar a localhost y a una base cuyo nombre termine en _test");
  }
}

describe("ventas", { skip: TEST_DATABASE_URL ? false : "Falta TEST_DATABASE_URL" }, () => {
  let pool: typeof import("../src/db/pool").pool;
  let server: Server;
  let baseUrl: string;
  let adminToken: string;
  let employeeToken: string;
  let sellerId: number;
  let mechanicId: number;
  let accessoryId: number;
  let serviceId: number;

  async function call(token: string | null, method: string, route: string, body?: unknown) {
    const response = await fetch(baseUrl + route, {
      method,
      headers: {
        ...(token && { Authorization: `Bearer ${token}` }),
        ...(body !== undefined && { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    return { status: response.status, data: (text ? JSON.parse(text) : null) as any };
  }

  const admin = (method: string, route: string, body?: unknown) => call(adminToken, method, route, body);
  const employee = (method: string, route: string, body?: unknown) => call(employeeToken, method, route, body);

  const counterSale = () => ({
    sellerId,
    paymentMethod: "Efectivo",
    isInvoiced: false,
    items: [{ description: "Casco", categoryId: accessoryId, quantity: 1, unitPrice: 12.5 }],
  });

  /** Orden de taller cobrada por Q200: un servicio de Q100 y dos repuestos de Q50. */
  async function chargedWorkshopOrder() {
    const { data: order } = await admin("POST", "/workshop", {
      clientName: "Ana",
      motorcycle: "Moto",
      workDescription: "Servicio general",
      mechanicId,
    });
    await admin("POST", `/workshop/${order.id}/items`, { kind: "servicio", description: "Mano de obra", categoryId: serviceId, quantity: 1, unitPrice: 100 });
    await admin("POST", `/workshop/${order.id}/items`, { kind: "repuesto", description: "Filtro", categoryId: accessoryId, quantity: 2, unitPrice: 50 });
    await admin("PATCH", `/workshop/${order.id}/status`, { status: "En reparación" });
    await admin("PATCH", `/workshop/${order.id}/status`, { status: "Lista para entregar" });
    const { data } = await admin("POST", `/workshop/${order.id}/checkout`, { sellerId, paymentMethod: "Efectivo", isInvoiced: false });
    return { orderId: order.id as number, sale: data.sale };
  }

  /** Lo que manda la pantalla de edición: los artículos con su origen, cambiando el precio del primero. */
  const editPayload = (sale: any, firstPrice: number) => ({
    sellerId: sale.sellerId,
    paymentMethod: sale.paymentMethod,
    isInvoiced: false,
    items: sale.items.map((item: any, index: number) => ({
      description: item.description,
      categoryId: item.categoryId,
      quantity: item.quantity,
      unitPrice: index === 0 ? firstPrice : item.unitPrice,
      commissionRate: item.commissionRate,
      origin: item.origin,
    })),
  });

  before(async () => {
    assertSafeToErase(TEST_DATABASE_URL!);
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    process.env.JWT_SECRET = randomBytes(48).toString("hex");

    ({ pool } = await import("../src/db/pool"));
    const { app } = await import("../src/app");
    const { hashPassword } = await import("../src/modules/auth/auth.service");

    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    const migrationsDir = path.resolve(process.cwd(), "server/db/migrations");
    for (const file of (await readdir(migrationsDir)).sort()) {
      await pool.query(await readFile(path.join(migrationsDir, file), "utf8"));
    }

    const password = randomBytes(16).toString("hex");
    const passwordHash = await hashPassword(password);
    await pool.query(
      `INSERT INTO users (username, role, password_hash) VALUES ('admin', 'Administrador', $1), ('empleado', 'Empleado', $1)`,
      [passwordHash],
    );
    const { rows: staff } = await pool.query<{ id: number; type: string }>(
      `INSERT INTO staff (full_name, type) VALUES ('Vendedor Prueba', 'Vendedor'), ('Mecánico Prueba', 'Mecánico') RETURNING id, type`,
    );
    sellerId = staff.find((member) => member.type === "Vendedor")!.id;
    mechanicId = staff.find((member) => member.type === "Mecánico")!.id;
    const categoryId = async (name: string) => (await pool.query<{ id: number }>(`SELECT id FROM categories WHERE name = $1`, [name])).rows[0].id;
    accessoryId = await categoryId("Accesorio");
    serviceId = await categoryId("Servicio de taller");

    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    baseUrl = `http://localhost:${(server.address() as AddressInfo).port}/api`;

    const login = async (role: string) => (await call(null, "POST", "/auth/login", { role, password })).data.token as string;
    adminToken = await login("Administrador");
    employeeToken = await login("Empleado");
  });

  after(async () => {
    server?.close();
    await pool?.end();
  });

  it("guarda el precio con sus decimales", async () => {
    const { status, data } = await admin("POST", "/sales", counterSale());
    assert.equal(status, 201);
    assert.equal(data.total, 12.5);
  });

  it("indica qué campo está mal cuando falta el NIT", async () => {
    const { status, data } = await admin("POST", "/sales", {
      ...counterSale(),
      isInvoiced: true,
      client: { taxIdType: "NIT", taxId: "", name: "Juan" },
    });
    assert.equal(status, 400);
    assert.equal(data.fields["client.taxId"], "NIT inválido");
  });

  describe("edición de ventas de taller", () => {
    it("ignora un origen enviado al crear una venta", async () => {
      const sale = counterSale();
      const { data } = await employee("POST", "/sales", { ...sale, items: [{ ...sale.items[0], origin: "taller_servicio" }] });
      assert.equal(data.items[0].origin, "venta");
    });

    it("conserva el origen de cada artículo; lo agregado queda como venta", async () => {
      const { sale } = await chargedWorkshopOrder();
      const payload = editPayload(sale, 100);
      payload.items.push({ description: "Calcomanía", categoryId: accessoryId, quantity: 1, unitPrice: 10, commissionRate: 2.5, origin: undefined });

      const { status, data } = await admin("PUT", `/sales/${sale.id}`, payload);
      assert.equal(status, 200);
      assert.deepEqual(data.items.map((item: any) => item.origin), ["taller_servicio", "taller_repuesto", "venta"]);
    });

    it("actualiza lo cobrado en la orden y deja huella", async () => {
      const { orderId, sale } = await chargedWorkshopOrder();
      await admin("PUT", `/sales/${sale.id}`, editPayload(sale, 1150));

      const { data: order } = await admin("GET", `/workshop/${orderId}`);
      assert.equal(order.finalCost, 1250);
      assert.ok(
        order.events.some((event: any) => event.description.includes("Q200.00 a Q1,250.00")),
        "la orden debe registrar el cambio en su bitácora",
      );
      const { rowCount } = await pool.query(
        `SELECT 1 FROM audit_log WHERE entity = 'workshop_orders' AND entity_id = $1 AND before_data ? 'finalCost'`,
        [String(orderId)],
      );
      assert.equal(rowCount, 1);
    });

    it("no cambia la orden si el total sigue igual", async () => {
      const { orderId, sale } = await chargedWorkshopOrder();
      const { data: orderBefore } = await admin("GET", `/workshop/${orderId}`);
      await admin("PUT", `/sales/${sale.id}`, editPayload(sale, 100));
      const { data: orderAfter } = await admin("GET", `/workshop/${orderId}`);
      assert.equal(orderAfter.events.length, orderBefore.events.length);
    });

    it("permite editar una venta que no viene de taller", async () => {
      const { data: created } = await admin("POST", "/sales", counterSale());
      const { status, data } = await admin("PUT", `/sales/${created.id}`, editPayload(created, 20));
      assert.equal(status, 200);
      assert.equal(data.total, 20);
    });
  });

  describe("permisos del empleado", () => {
    it("ve una venta de hoy, sin datos de comisión", async () => {
      const { data: created } = await admin("POST", "/sales", counterSale());
      const { status, data } = await employee("GET", `/sales/${created.id}`);
      assert.equal(status, 200);
      assert.equal(data.items[0].commissionRate, undefined);
    });

    it("recibe lo mismo que si no existiera al pedir una venta antigua", async () => {
      const { data: created } = await admin("POST", "/sales", counterSale());
      await pool.query(`UPDATE sales SET sold_at = now() - interval '3 days' WHERE id = $1`, [created.id]);

      const old = await employee("GET", `/sales/${created.id}`);
      const missing = await employee("GET", "/sales/99999999");
      assert.equal(old.status, 404);
      assert.deepEqual(old.data, missing.data);
      assert.equal((await admin("GET", `/sales/${created.id}`)).status, 200);
    });

    it("cuenta el día en hora de Guatemala: ayer a las 23:30 no es hoy", async () => {
      const { data: created } = await admin("POST", "/sales", counterSale());
      await pool.query(
        `UPDATE sales
         SET sold_at = ((now() AT TIME ZONE 'America/Guatemala')::date - 1 + time '23:30') AT TIME ZONE 'America/Guatemala'
         WHERE id = $1`,
        [created.id],
      );
      assert.equal((await employee("GET", `/sales/${created.id}`)).status, 404);
    });

    it("no puede editar ventas", async () => {
      const { data: created } = await admin("POST", "/sales", counterSale());
      assert.equal((await employee("PUT", `/sales/${created.id}`, counterSale())).status, 403);
    });
  });

  // Va al final: el cierre deja en solo lectura todas las ventas creadas hasta aquí
  it("rechaza editar una venta cerrada y no toca su orden", async () => {
    const { orderId, sale } = await chargedWorkshopOrder();
    const { data: period } = await admin("GET", "/closures/open");
    const closure = await admin("POST", "/closures", { periodStart: period.periodStart, periodEnd: period.today });
    assert.equal(closure.status, 201);

    const { status } = await admin("PUT", `/sales/${sale.id}`, editPayload(sale, 500));
    assert.equal(status, 409);
    assert.equal((await admin("GET", `/workshop/${orderId}`)).data.finalCost, 200);
  });
});
