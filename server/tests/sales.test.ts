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
  let initialPassword: string;
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

    initialPassword = randomBytes(16).toString("hex");
    const passwordHash = await hashPassword(initialPassword);
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

    const login = async (role: string) => (await call(null, "POST", "/auth/login", { role, password: initialPassword })).data.token as string;
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

  describe("eliminar ventas", () => {
    it("una venta de taller devuelve la orden a pendiente de cobro y se puede volver a cobrar", async () => {
      const { orderId, sale } = await chargedWorkshopOrder();
      assert.equal((await admin("DELETE", `/sales/${sale.id}`)).status, 204);

      const { data: order } = await admin("GET", `/workshop/${orderId}`);
      assert.equal(order.status, "Lista para entregar");
      assert.equal(order.saleId, null);
      assert.equal(order.finalCost, null);
      assert.equal(order.deliveredAt, null);
      assert.ok(order.events.some((event: any) => event.description.includes(`venta #${sale.id}`)));

      const again = await admin("POST", `/workshop/${orderId}/checkout`, { sellerId, paymentMethod: "Tarjeta", isInvoiced: false });
      assert.equal(again.status, 201);
      assert.equal(again.data.sale.total, 200);
    });

    it("una venta sin orden se elimina normalmente", async () => {
      const { data: created } = await admin("POST", "/sales", counterSale());
      assert.equal((await admin("DELETE", `/sales/${created.id}`)).status, 204);
      assert.equal((await admin("GET", `/sales/${created.id}`)).status, 404);
    });
  });

  describe("vendedor inactivo", () => {
    let inactiveSale: any;
    let inactiveSellerId: number;

    before(async () => {
      const { data: member } = await admin("POST", "/staff", { fullName: "Ya No Trabaja", type: "Vendedor" });
      inactiveSellerId = member.id;
      ({ data: inactiveSale } = await admin("POST", "/sales", { ...counterSale(), sellerId: inactiveSellerId }));
      await admin("PATCH", `/staff/${inactiveSellerId}/active`, { isActive: false });
    });

    it("su venta se puede editar sin cambiarle el vendedor", async () => {
      const { status, data } = await admin("PUT", `/sales/${inactiveSale.id}`, editPayload(inactiveSale, 30));
      assert.equal(status, 200);
      assert.equal(data.sellerId, inactiveSellerId);
      assert.equal(data.total, 30);
    });

    it("no se le puede asignar otra venta", async () => {
      const { data: other } = await admin("POST", "/sales", counterSale());
      const moved = await admin("PUT", `/sales/${other.id}`, { ...editPayload(other, 10), sellerId: inactiveSellerId });
      assert.equal(moved.status, 400);
      assert.equal((await admin("POST", "/sales", { ...counterSale(), sellerId: inactiveSellerId })).status, 400);
    });
  });

  describe("clientes por NIT o CUI", () => {
    const invoiced = (taxIdType: string, taxId: string, name: string) => ({
      ...counterSale(),
      isInvoiced: true,
      client: { taxIdType, taxId, name },
    });
    const clientCount = async (name: string) =>
      (await pool.query(`SELECT 1 FROM clients WHERE name = $1`, [name])).rowCount;

    it("encuentra al cliente sin importar guiones ni espacios", async () => {
      await admin("POST", "/sales", invoiced("NIT", "5489632-1", "Juan"));
      assert.equal((await admin("GET", "/sales/clients/54896321")).data.name, "Juan");
      assert.equal((await admin("GET", "/sales/clients/5489632-1")).data.name, "Juan");

      await admin("POST", "/sales", invoiced("CUI", "2345 12345 0101", "Luisa"));
      assert.equal((await admin("GET", "/sales/clients/2345123450101")).data.name, "Luisa");
    });

    it("distingue el dígito verificador K sin importar mayúsculas", async () => {
      await admin("POST", "/sales", invoiced("NIT", "1234567-k", "Rosa"));
      assert.equal((await admin("GET", "/sales/clients/1234567K")).data.name, "Rosa");
    });

    it("no crea otro cliente si el NIT viene en otro formato, y la factura guarda lo escrito", async () => {
      await admin("POST", "/sales", invoiced("NIT", "7654321-0", "Nombre Viejo"));
      const { data: sale } = await admin("POST", "/sales", invoiced("NIT", "76543210", "Nombre Nuevo"));

      assert.equal(await clientCount("Nombre Viejo"), 0);
      assert.equal(await clientCount("Nombre Nuevo"), 1);
      assert.equal(sale.client.taxId, "76543210");
    });
  });

  describe("historial paginado", () => {
    const route = (extra = "") => `/sales?from=2020-01-01&to=2099-12-31${extra}`;

    before(async () => {
      for (let i = 0; i < 3; i++) await admin("POST", "/sales", counterSale());
    });

    it("devuelve la página pedida sin repetir ventas", async () => {
      const first = (await admin("GET", route("&page=1&pageSize=2"))).data;
      const second = (await admin("GET", route("&page=2&pageSize=2"))).data;

      assert.equal(first.items.length, 2);
      assert.equal(first.pageSize, 2);
      assert.equal(first.totalPages, Math.ceil(first.totalItems / 2));
      const ids = [...first.items, ...second.items].map((sale: any) => sale.id);
      assert.equal(new Set(ids).size, 4);
    });

    it("una página de más devuelve la última en vez de una vacía", async () => {
      const { data } = await admin("GET", route("&page=9999&pageSize=2"));
      assert.equal(data.page, data.totalPages);
      assert.ok(data.items.length > 0);
    });

    it("el total respeta los filtros", async () => {
      const { data } = await admin("GET", route("&search=Calcoman"));
      assert.equal(data.totalItems, data.items.length);
      assert.ok(data.items.every((sale: any) => sale.itemsSummary.includes("Calcoman")));
      assert.ok(data.totalItems > 0);
    });

    it("el empleado sigue recibiendo solo lo de hoy y sin comisiones", async () => {
      const { data } = await employee("GET", route("&pageSize=100"));
      assert.ok(data.items.length > 0);
      for (const sale of data.items) {
        assert.equal(sale.commissionAmount, undefined);
        assert.equal(sale.hasPendingCommission, undefined);
      }
    });

    it("marca las ventas abiertas", async () => {
      const { data } = await admin("GET", route("&pageSize=1"));
      assert.equal(data.items[0].isClosed, false);
    });
  });

  /** Recorre todas las páginas de una ruta paginada y junta los ids de cada registro. */
  async function collectPages(route: (page: number) => string, idOf: (item: any) => number) {
    const ids: number[] = [];
    let page = 1;
    let totalPages = 1;
    let totalItems = 0;
    do {
      const { data } = await admin("GET", route(page));
      ids.push(...data.items.map(idOf));
      totalPages = data.totalPages;
      totalItems = data.totalItems;
      page++;
    } while (page <= totalPages);
    return { ids, totalItems, totalPages };
  }

  const yesterdayOf = (day: string) => new Date(Date.parse(`${day}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

  describe("ventas eliminadas", () => {
    let today: string;
    const deletedRoute = (query = "") => `/sales/deleted?from=${today}&to=${today}${query}`;
    const saleOf = (description: string, unitPrice: number) => ({
      ...counterSale(),
      items: [{ description, categoryId: accessoryId, quantity: 2, unitPrice }],
    });

    before(async () => {
      today = (await import("../src/lib/dates")).todayInGuatemala();
    });

    it("guarda la venta como estaba, con su motivo y quién la eliminó", async () => {
      const { data: sale } = await admin("POST", "/sales", saleOf("Chaqueta eliminada", 300));
      assert.equal((await admin("DELETE", `/sales/${sale.id}`, { reason: "Se registró dos veces" })).status, 204);
      assert.equal((await admin("GET", `/sales/${sale.id}`)).status, 404);

      const { status, data } = await admin("GET", deletedRoute(`&search=${sale.id}`));
      assert.equal(status, 200);
      const row = data.items.find((item: any) => item.saleId === sale.id);
      assert.ok(row, "la venta eliminada debe aparecer en el historial");
      assert.equal(row.reason, "Se registró dos veces");
      assert.equal(row.deletedByRole, "Administrador");
      assert.equal(row.sale.total, 600);
      assert.equal(row.sale.sellerName, "Vendedor Prueba");
      assert.equal(row.sale.items[0].description, "Chaqueta eliminada");
    });

    it("sin motivo queda vacío", async () => {
      const { data: sale } = await admin("POST", "/sales", saleOf("Guantes sin motivo", 80));
      assert.equal((await admin("DELETE", `/sales/${sale.id}`)).status, 204);
      const { data } = await admin("GET", deletedRoute(`&search=${sale.id}`));
      assert.equal(data.items.find((item: any) => item.saleId === sale.id).reason, null);
    });

    it("rechaza un motivo demasiado largo y no elimina la venta", async () => {
      const { data: sale } = await admin("POST", "/sales", saleOf("Casco motivo largo", 90));
      const { status, data } = await admin("DELETE", `/sales/${sale.id}`, { reason: "x".repeat(301) });
      assert.equal(status, 400);
      assert.ok(data.fields.reason);
      assert.equal((await admin("GET", `/sales/${sale.id}`)).status, 200);
    });

    it("busca por producto, vendedor y número de venta con o sin #", async () => {
      const { data: sale } = await admin("POST", "/sales", saleOf("Pechera buscable", 150));
      await admin("DELETE", `/sales/${sale.id}`);
      const found = async (search: string) =>
        (await admin("GET", deletedRoute(`&search=${encodeURIComponent(search)}`))).data.items.some((item: any) => item.saleId === sale.id);
      assert.ok(await found("pechera BUSCABLE"));
      assert.ok(await found("Vendedor Prueba"));
      assert.ok(await found(`#${sale.id}`));
      assert.ok(await found(String(sale.id)));
      assert.equal(await found("no existe ningún producto así"), false);
    });

    it("el rango de fechas es el del día en que se eliminó", async () => {
      const yesterday = yesterdayOf(today);
      const { data } = await admin("GET", `/sales/deleted?from=${yesterday}&to=${yesterday}`);
      assert.equal(data.totalItems, 0);
      assert.equal(data.items.length, 0);
    });

    it("pagina sin repetir y una página de más devuelve la última", async () => {
      for (let n = 0; n < 3; n++) {
        const { data: sale } = await admin("POST", "/sales", saleOf(`Paginada ${n}`, 10 + n));
        await admin("DELETE", `/sales/${sale.id}`);
      }
      const { ids, totalItems, totalPages } = await collectPages((page) => deletedRoute(`&pageSize=2&page=${page}`), (item) => item.auditId);
      assert.equal(ids.length, totalItems);
      assert.equal(new Set(ids).size, ids.length, "ninguna venta se repite entre páginas");
      assert.ok(totalPages >= 3);

      const { data: beyond } = await admin("GET", deletedRoute("&pageSize=2&page=999"));
      assert.equal(beyond.page, totalPages);
      assert.ok(beyond.items.length > 0);
    });

    it("una venta de taller eliminada conserva qué fue servicio y qué repuesto", async () => {
      const { sale } = await chargedWorkshopOrder();
      await admin("DELETE", `/sales/${sale.id}`, { reason: "Cobro equivocado" });
      const { data } = await admin("GET", deletedRoute(`&search=${sale.id}`));
      const origins = data.items.find((item: any) => item.saleId === sale.id).sale.items.map((item: any) => item.origin).sort();
      assert.deepEqual(origins, ["taller_repuesto", "taller_servicio"]);
    });

    it("solo el Administrador las consulta", async () => {
      assert.equal((await employee("GET", deletedRoute())).status, 403);
    });
  });

  describe("historial de taller paginado", () => {
    /** Orden cobrada con un cliente propio, para poder buscarla sin chocar con las demás pruebas. */
    async function deliveredOrder(clientName: string) {
      const { data: order } = await admin("POST", "/workshop", { clientName, motorcycle: "Suzuki GN125", workDescription: "Servicio", mechanicId });
      await admin("POST", `/workshop/${order.id}/items`, { kind: "servicio", description: "Mano de obra", categoryId: serviceId, quantity: 1, unitPrice: 75 });
      await admin("PATCH", `/workshop/${order.id}/status`, { status: "En reparación" });
      await admin("PATCH", `/workshop/${order.id}/status`, { status: "Lista para entregar" });
      await admin("POST", `/workshop/${order.id}/checkout`, { sellerId, paymentMethod: "Efectivo", isInvoiced: false });
      return order.id as number;
    }

    const historyIds: number[] = [];
    before(async () => {
      for (const name of ["Historial Uno", "Historial Dos", "Historial Tres"]) historyIds.push(await deliveredOrder(name));
    });

    it("las entregadas salen de activas y el historial pagina sin repetir", async () => {
      const { data: active } = await admin("GET", "/workshop");
      assert.ok(historyIds.every((id) => !active.some((order: any) => order.id === id)));

      const { ids, totalItems, totalPages } = await collectPages((page) => `/workshop/history?search=Historial&pageSize=2&page=${page}`, (order) => order.id);
      assert.equal(totalItems, 3);
      assert.equal(totalPages, 2);
      assert.deepEqual(ids, [...historyIds].reverse(), "de la más reciente a la más antigua");
    });

    it("encuentra una orden por su número aunque esté en otra página", async () => {
      const target = historyIds[0];
      for (const search of [`OT-${String(target).padStart(4, "0")}`, `ot${target}`, String(target)]) {
        const { data } = await admin("GET", `/workshop/history?search=${encodeURIComponent(search)}&pageSize=1`);
        assert.ok(data.items.some((order: any) => order.id === target), `buscar "${search}"`);
      }
    });

    it("el resumen cuenta las entregadas de hoy y el total del historial", async () => {
      const { data: summary } = await admin("GET", "/workshop/summary");
      const { data: all } = await admin("GET", "/workshop/history?pageSize=1");
      assert.equal(summary.deliveredTotal, all.totalItems);
      assert.ok(summary.deliveredToday >= 3);
    });

    it("una página de más devuelve la última, y el empleado también lo consulta", async () => {
      const { data } = await employee("GET", "/workshop/history?search=Historial&pageSize=2&page=50");
      assert.equal(data.page, 2);
      assert.equal(data.items.length, 1);
      assert.equal((await employee("GET", "/workshop/summary")).status, 200);
    });

    describe("el empleado solo ve lo entregado hoy", () => {
      let todayOrder: number;
      let oldOrder: number;
      let lateYesterdayOrder: number;

      before(async () => {
        todayOrder = await deliveredOrder("Fecha Hoy");
        oldOrder = await deliveredOrder("Fecha Vieja");
        lateYesterdayOrder = await deliveredOrder("Fecha Anoche");
        await pool.query(`UPDATE workshop_orders SET delivered_at = now() - interval '3 days' WHERE id = $1`, [oldOrder]);
        await pool.query(
          `UPDATE workshop_orders
           SET delivered_at = ((now() AT TIME ZONE 'America/Guatemala')::date - 1 + time '23:30') AT TIME ZONE 'America/Guatemala'
           WHERE id = $1`,
          [lateYesterdayOrder],
        );
      });

      const idsIn = async (token: typeof admin, query: string) =>
        (await token("GET", `/workshop/history?${query}&pageSize=100`)).data.items.map((order: any) => order.id);

      it("el historial solo trae las de hoy; el Administrador las ve todas", async () => {
        assert.deepEqual(await idsIn(employee, "search=Fecha"), [todayOrder]);
        assert.deepEqual(new Set(await idsIn(admin, "search=Fecha")), new Set([todayOrder, oldOrder, lateYesterdayOrder]));
      });

      it("no encuentra una orden antigua buscando su número", async () => {
        assert.deepEqual(await idsIn(employee, `search=${oldOrder}`), []);
        assert.deepEqual(await idsIn(admin, `search=${oldOrder}`), [oldOrder]);
      });

      it("el detalle de una orden antigua responde igual que si no existiera", async () => {
        const old = await employee("GET", `/workshop/${oldOrder}`);
        const missing = await employee("GET", "/workshop/99999999");
        assert.equal(old.status, 404);
        assert.deepEqual(old.data, missing.data);
        assert.equal((await employee("GET", `/workshop/${lateYesterdayOrder}`)).status, 404, "ayer 23:30 en Guatemala no es hoy");
        assert.equal((await employee("GET", `/workshop/${todayOrder}`)).status, 200);
        assert.equal((await admin("GET", `/workshop/${oldOrder}`)).status, 200);
      });

      it("sigue viendo las órdenes activas, sin importar cuándo se recibieron", async () => {
        const { data: order } = await admin("POST", "/workshop", { clientName: "Sigue Activa", motorcycle: "Moto", workDescription: "Servicio", mechanicId });
        await pool.query(`UPDATE workshop_orders SET received_at = now() - interval '10 days' WHERE id = $1`, [order.id]);
        assert.equal((await employee("GET", `/workshop/${order.id}`)).status, 200);
        assert.ok((await employee("GET", "/workshop")).data.some((active: any) => active.id === order.id));
      });

      it("el contador del historial solo cuenta lo que cada rol puede ver", async () => {
        const employeeSummary = (await employee("GET", "/workshop/summary")).data;
        const adminSummary = (await admin("GET", "/workshop/summary")).data;
        assert.equal(employeeSummary.deliveredTotal, employeeSummary.deliveredToday);
        assert.equal(adminSummary.deliveredTotal, employeeSummary.deliveredTotal + 2);
      });
    });
  });

  describe("edición de gastos", () => {
    const expense = { spentOn: "2026-01-15", amount: 150.5, area: "Tienda", category: "Servicios", description: "Luz del local" };

    it("cambia los datos y deja huella con el antes y el después", async () => {
      const { data: created } = await admin("POST", "/expenses", expense);
      const changes = { spentOn: "2026-01-20", amount: 175.25, area: "Taller", category: "Repuestos", description: "Compra corregida" };

      const { status, data } = await admin("PUT", `/expenses/${created.id}`, changes);
      assert.equal(status, 200);
      assert.deepEqual(data, { id: created.id, ...changes });

      const { rows } = await pool.query(
        `SELECT before_data, after_data FROM audit_log WHERE entity = 'expenses' AND entity_id = $1 AND action = 'editar'`,
        [String(created.id)],
      );
      assert.equal(rows.length, 1);
      assert.equal(rows[0].before_data.description, "Luz del local");
      assert.equal(rows[0].after_data.amount, 175.25);
    });

    it("los totales por área reflejan el cambio", async () => {
      const range = "from=2026-03-01&to=2026-03-31";
      const { data: created } = await admin("POST", "/expenses", { ...expense, spentOn: "2026-03-10", amount: 100 });
      assert.equal((await admin("GET", `/expenses?${range}`)).data.summary.byArea.Tienda, 100);

      await admin("PUT", `/expenses/${created.id}`, { ...expense, spentOn: "2026-03-10", amount: 100, area: "Taller" });
      const { summary } = (await admin("GET", `/expenses?${range}`)).data;
      assert.equal(summary.byArea.Tienda, 0);
      assert.equal(summary.byArea.Taller, 100);
    });

    it("valida los datos y no cambia nada si son inválidos", async () => {
      const { data: created } = await admin("POST", "/expenses", { ...expense, spentOn: "2026-04-10" });
      const { status, data } = await admin("PUT", `/expenses/${created.id}`, { ...expense, spentOn: "2026-04-10", amount: -5 });
      assert.equal(status, 400);
      assert.ok(data.fields.amount);
      const { data: list } = await admin("GET", "/expenses?from=2026-04-10&to=2026-04-10");
      assert.equal(list.items[0].amount, expense.amount);
    });

    it("responde 404 si el gasto no existe, y 403 al empleado", async () => {
      assert.equal((await admin("PUT", "/expenses/99999999", expense)).status, 404);
      const { data: created } = await admin("POST", "/expenses", { ...expense, spentOn: "2026-05-10" });
      assert.equal((await employee("PUT", `/expenses/${created.id}`, expense)).status, 403);
    });
  });

  describe("cobro de taller con factura", () => {
    it("devuelve la venta con su cliente y lo deja disponible para autocompletar", async () => {
      const { data: order } = await admin("POST", "/workshop", { clientName: "Ana", motorcycle: "Moto", workDescription: "Servicio", mechanicId });
      await admin("POST", `/workshop/${order.id}/items`, { kind: "servicio", description: "Mano de obra", categoryId: serviceId, quantity: 1, unitPrice: 75 });
      await admin("PATCH", `/workshop/${order.id}/status`, { status: "En reparación" });
      await admin("PATCH", `/workshop/${order.id}/status`, { status: "Lista para entregar" });

      const { status, data } = await employee("POST", `/workshop/${order.id}/checkout`, {
        sellerId,
        paymentMethod: "Efectivo",
        isInvoiced: true,
        client: { taxIdType: "NIT", taxId: "9988776-5", name: "Cliente de Taller", address: "Zona 1" },
      });
      assert.equal(status, 201);
      assert.equal(data.sale.isInvoiced, true);
      assert.equal(data.sale.client.name, "Cliente de Taller");

      const lookup = await employee("GET", "/sales/clients/99887765");
      assert.equal(lookup.data.name, "Cliente de Taller");
      assert.equal(lookup.data.address, "Zona 1");
    });
  });

  it("pide elegir al vendedor si no se indica", async () => {
    const { sellerId: _omitted, ...withoutSeller } = counterSale();
    const { status, data } = await admin("POST", "/sales", withoutSeller);
    assert.equal(status, 400);
    assert.equal(data.fields.sellerId, "Elige el vendedor");
  });

  it("los mensajes de 'no encontrado' están bien escritos", async () => {
    assert.equal((await admin("GET", "/sales/99999999")).data.error, "No se encontró la venta");
    assert.equal((await admin("GET", "/workshop/99999999")).data.error, "No se encontró la orden de taller");
    assert.equal((await admin("PUT", "/expenses/99999999", { spentOn: "2026-01-01", amount: 1, area: "Tienda", category: "Otros", description: "Nada" })).data.error, "No se encontró el gasto");
  });

  describe("sesiones y contraseñas", () => {
    const me = (token: string) => call(token, "GET", "/auth/me");
    const login = (role: string, password: string) => call(null, "POST", "/auth/login", { role, password });

    it("un token sin la huella de la contraseña ya no sirve", async () => {
      const jwt = (await import("jsonwebtoken")).default;
      const { data: user } = await me(employeeToken);
      const oldFormat = jwt.sign(user, process.env.JWT_SECRET!, { expiresIn: "12h" });
      assert.equal((await me(oldFormat)).status, 401);
    });

    it("cambiar la contraseña del empleado cierra su sesión, pero no la del administrador", async () => {
      const previous = employeeToken;
      const newPassword = "nueva-del-empleado";
      const { status, data } = await admin("PUT", "/auth/password", { role: "Empleado", newPassword });
      assert.equal(status, 200);
      assert.equal(data.token, null);

      assert.equal((await me(previous)).status, 401);
      assert.equal((await me(adminToken)).status, 200);
      assert.equal((await login("Empleado", initialPassword)).status, 401);

      const relogin = await login("Empleado", newPassword);
      assert.equal(relogin.status, 200);
      employeeToken = relogin.data.token;
      assert.equal((await me(employeeToken)).status, 200);
    });

    it("quien cambia su propia contraseña sigue en sesión con un token nuevo", async () => {
      const previous = adminToken;
      const { data } = await admin("PUT", "/auth/password", { role: "Administrador", newPassword: "nueva-del-admin" });
      assert.ok(data.token);
      assert.equal((await me(previous)).status, 401);
      assert.equal((await me(data.token)).status, 200);
      adminToken = data.token;
    });

    it("el empleado no puede cambiar contraseñas", async () => {
      assert.equal((await employee("PUT", "/auth/password", { role: "Administrador", newPassword: "intento-del-empleado" })).status, 403);
    });

    // Va al último del grupo: deja bloqueado el login del empleado en esta corrida
    it("tras cinco intentos fallidos bloquea el login de ese rol, aunque la contraseña sea correcta", async () => {
      for (let attempt = 0; attempt < 5; attempt++) {
        assert.equal((await login("Empleado", "contraseña-equivocada")).status, 401);
      }
      const blocked = await login("Empleado", "nueva-del-empleado");
      assert.equal(blocked.status, 429);
      assert.match(blocked.data.error, /Demasiados intentos/);

      assert.equal((await login("Administrador", "nueva-del-admin")).status, 200, "el otro rol sigue funcionando");
      assert.equal((await me(employeeToken)).status, 200, "las sesiones abiertas no se afectan");
    });
  });

  describe("comisiones paginadas", () => {
    let today: string;
    const itemsRoute = (query: string) => `/commissions/items?from=${today}&to=${today}${query}`;

    before(async () => {
      today = (await import("../src/lib/dates")).todayInGuatemala();
      // El empleado no fija comisiones: un servicio de taller queda pendiente
      for (let n = 0; n < 3; n++) {
        await employee("POST", "/sales", {
          ...counterSale(),
          items: [{ description: `Servicio pendiente ${n}`, categoryId: serviceId, quantity: 1, unitPrice: 40 }],
        });
      }
    });

    it("pagina los artículos sin repetir", async () => {
      const { ids, totalItems } = await collectPages((page) => itemsRoute(`&sellerId=${sellerId}&pageSize=2&page=${page}`), (item) => item.id);
      assert.ok(totalItems >= 3);
      assert.equal(ids.length, totalItems);
      assert.equal(new Set(ids).size, ids.length);
    });

    it("el total respeta el filtro de pendientes", async () => {
      const { data } = await admin("GET", itemsRoute("&status=pendientes&pageSize=100"));
      assert.equal(data.totalItems, data.items.length);
      assert.ok(data.totalItems >= 3);
      assert.ok(data.items.every((item: any) => item.commissionRate === null));
    });

    it("solo el Administrador lo consulta", async () => {
      assert.equal((await employee("GET", itemsRoute("&pageSize=2"))).status, 403);
    });
  });

  describe("categorías en Configuración", () => {
    const listNames = async (who: typeof admin) => ((await who("GET", "/categories")).data as any[]).map((c) => c.name);
    let tiresId: number;
    let saleWithTires: any;

    it("el administrador agrega una categoría y queda antes de Otro", async () => {
      const { status, data } = await admin("POST", "/settings/categories", { name: "  Llantas   y  rines ", defaultCommissionRate: 3 });
      assert.equal(status, 201);
      assert.equal(data.name, "Llantas y rines");
      assert.equal(data.defaultCommissionRate, 3);
      assert.equal(data.isActive, true);
      tiresId = data.id;

      const names = await listNames(employee);
      assert.ok(names.includes("Llantas y rines"));
      assert.ok(names.indexOf("Llantas y rines") < names.indexOf("Otro"), "Otro sigue siendo la última");
    });

    it("una venta con la categoría nueva toma su comisión", async () => {
      const { status, data } = await employee("POST", "/sales", {
        ...counterSale(),
        items: [{ description: "Llanta Pirelli", categoryId: tiresId, quantity: 2, unitPrice: 400 }],
      });
      assert.equal(status, 201);
      const { data: sale } = await admin("GET", `/sales/${data.id}`);
      assert.equal(sale.items[0].commissionRate, 3);
      assert.equal(sale.items[0].commissionAmount, 24);
      saleWithTires = sale;
    });

    it("no permite nombres repetidos sin importar mayúsculas, ni datos inválidos", async () => {
      const duplicate = await admin("POST", "/settings/categories", { name: "LLANTAS Y RINES", defaultCommissionRate: null });
      assert.equal(duplicate.status, 409);
      assert.match(duplicate.data.error, /Ya existe la categoría/);

      const empty = await admin("POST", "/settings/categories", { name: " ", defaultCommissionRate: null });
      assert.equal(empty.status, 400);
      assert.ok(empty.data.fields.name);

      const tooHigh = await admin("POST", "/settings/categories", { name: "Cascos premium", defaultCommissionRate: 101 });
      assert.equal(tooHigh.status, 400);
      assert.ok(tooHigh.data.fields.defaultCommissionRate);
    });

    it("solo el administrador agrega o desactiva categorías", async () => {
      assert.equal((await employee("POST", "/settings/categories", { name: "Del empleado", defaultCommissionRate: null })).status, 403);
      assert.equal((await employee("PATCH", `/settings/categories/${tiresId}/active`, { isActive: false })).status, 403);
    });

    it("al desactivarla deja de ofrecerse y no se puede usar en ventas nuevas", async () => {
      const { status, data } = await admin("PATCH", `/settings/categories/${tiresId}/active`, { isActive: false });
      assert.equal(status, 200);
      assert.equal(data.isActive, false);

      assert.ok(!(await listNames(employee)).includes("Llantas y rines"), "el empleado ya no la ve");
      const adminList = (await admin("GET", "/categories")).data as any[];
      assert.equal(adminList.find((c) => c.id === tiresId).isActive, false, "el administrador la sigue viendo como inactiva");

      const newSale = await admin("POST", "/sales", {
        ...counterSale(),
        items: [{ description: "Rin", categoryId: tiresId, quantity: 1, unitPrice: 100 }],
      });
      assert.equal(newSale.status, 400);
    });

    it("una venta pasada con la categoría desactivada se sigue pudiendo editar", async () => {
      const { status, data } = await admin("PUT", `/sales/${saleWithTires.id}`, editPayload(saleWithTires, 450));
      assert.equal(status, 200);
      assert.equal(data.items[0].categoryId, tiresId);
      assert.equal(data.items[0].unitPrice, 450);
    });

    it("avisa que existe aunque esté desactivada, y se puede volver a activar", async () => {
      const duplicate = await admin("POST", "/settings/categories", { name: "llantas y rines", defaultCommissionRate: null });
      assert.equal(duplicate.status, 409);
      assert.match(duplicate.data.error, /desactivada/);

      assert.equal((await admin("PATCH", `/settings/categories/${tiresId}/active`, { isActive: true })).status, 200);
      assert.ok((await listNames(employee)).includes("Llantas y rines"));
    });

    it("no se desactiva si una orden de taller sin cobrar la usa", async () => {
      const { data: category } = await admin("POST", "/settings/categories", { name: "Lubricantes", defaultCommissionRate: 2 });
      const { data: order } = await admin("POST", "/workshop", { clientName: "Categoría en uso", motorcycle: "Moto", workDescription: "Cambio de aceite", mechanicId });
      await admin("POST", `/workshop/${order.id}/items`, { kind: "repuesto", description: "Aceite", categoryId: category.id, quantity: 1, unitPrice: 60 });

      const blocked = await admin("PATCH", `/settings/categories/${category.id}/active`, { isActive: false });
      assert.equal(blocked.status, 409);
      assert.match(blocked.data.error, /orden de taller sin cobrar/);

      // Cobrada la orden, ya se puede desactivar
      await admin("PATCH", `/workshop/${order.id}/status`, { status: "En reparación" });
      await admin("PATCH", `/workshop/${order.id}/status`, { status: "Lista para entregar" });
      assert.equal((await admin("POST", `/workshop/${order.id}/checkout`, { sellerId, paymentMethod: "Efectivo", isInvoiced: false })).status, 201);
      assert.equal((await admin("PATCH", `/settings/categories/${category.id}/active`, { isActive: false })).status, 200);
    });

    it("una orden reabierta se puede volver a cobrar aunque su categoría ya esté inactiva", async () => {
      const { data: category } = await admin("POST", "/settings/categories", { name: "Para reabrir", defaultCommissionRate: 4 });
      const { data: order } = await admin("POST", "/workshop", { clientName: "Orden reabierta", motorcycle: "Moto", workDescription: "Servicio", mechanicId });
      await admin("POST", `/workshop/${order.id}/items`, { kind: "repuesto", description: "Pieza", categoryId: category.id, quantity: 1, unitPrice: 100 });
      await admin("PATCH", `/workshop/${order.id}/status`, { status: "En reparación" });
      await admin("PATCH", `/workshop/${order.id}/status`, { status: "Lista para entregar" });
      const charge = () => employee("POST", `/workshop/${order.id}/checkout`, { sellerId, paymentMethod: "Efectivo", isInvoiced: false });

      const first = await charge();
      assert.equal(first.status, 201);
      assert.equal((await admin("PATCH", `/settings/categories/${category.id}/active`, { isActive: false })).status, 200);
      assert.equal((await admin("DELETE", `/sales/${first.data.sale.id}`)).status, 204);

      const second = await charge();
      assert.equal(second.status, 201, second.data.error);
      assert.equal(second.data.order.status, "Entregada");
      const { data: sale } = await admin("GET", `/sales/${second.data.sale.id}`);
      assert.equal(sale.items[0].categoryId, category.id);
      assert.equal(sale.items[0].commissionRate, 4);
      assert.equal(sale.items[0].origin, "taller_repuesto");
    });

    it("la categoría inactiva se sigue pudiendo consultar en historial y estadísticas", async () => {
      const { data: category } = await admin("POST", "/settings/categories", { name: "Para filtrar", defaultCommissionRate: null });
      await admin("POST", "/sales", { ...counterSale(), items: [{ description: "Vendida antes", categoryId: category.id, quantity: 1, unitPrice: 70 }] });
      await admin("PATCH", `/settings/categories/${category.id}/active`, { isActive: false });

      const history = await admin("GET", `/sales?from=2020-01-01&to=2099-12-31&categoryId=${category.id}`);
      assert.deepEqual(history.data.items.map((sale: any) => sale.itemsSummary), ["Vendida antes"]);
      const stats = await admin("GET", `/reports/stats?from=2020-01-01&to=2099-12-31&categoryId=${category.id}`);
      assert.equal(stats.data.current.totals.total, 70);
    });
  });

  // Va al final: el cierre deja en solo lectura todas las ventas creadas hasta aquí
  it("una venta cerrada no se edita ni se elimina, su orden no cambia y el historial la marca", async () => {
    const { orderId, sale } = await chargedWorkshopOrder();
    const { data: period } = await admin("GET", "/closures/open");
    const closure = await admin("POST", "/closures", { periodStart: period.periodStart, periodEnd: period.today });
    assert.equal(closure.status, 201);

    assert.equal((await admin("PUT", `/sales/${sale.id}`, editPayload(sale, 500))).status, 409);
    assert.equal((await admin("DELETE", `/sales/${sale.id}`)).status, 409);

    const { data: order } = await admin("GET", `/workshop/${orderId}`);
    assert.equal(order.finalCost, 200);
    assert.equal(order.status, "Entregada");
    assert.equal(order.saleId, sale.id);

    const { data: history } = await admin("GET", `/sales?from=${period.today}&to=${period.today}&pageSize=1`);
    assert.equal(history.items[0].isClosed, true);
  });
});
