# Inventario

Pedido del cliente en noviembre de 2026. Se divide en dos partes para trabajarlo entre dos:

| Parte | Quién | Qué |
|---|---|---|
| **A · Base del inventario** | Luis | Base de datos, catálogo de productos, motos por chasis, entradas, ajustes, kárdex, pantalla Inventario y el **motor de existencias**. ✅ Hecha |
| **B · Conectarlo con ventas y taller** | Fernanda | Elegir productos al vender y en el taller, descontar y devolver existencias, chasis en la factura y avisos de existencias bajas. |

La parte B **no necesita migraciones nuevas**: la 007 ya trae todas las columnas que usa.

## Decisiones (las tomó el cliente)

1. **Ventas mixtas:** una venta puede tener productos del inventario **y** líneas escritas a mano (servicios, cobros especiales). Las ventas viejas siguen igual.
2. **Sin existencias, no se vende:** si no alcanza, el sistema bloquea la venta. Si el inventario está mal, el Administrador lo corrige con un ajuste.
3. **Motos por unidad:** cada moto se registra con su número de chasis (y motor, opcional). Al vender se elige cuál.
4. **Taller:** los repuestos del inventario se **apartan al agregarlos** a la orden y regresan si se quitan.

## Lo que ya existe (parte A)

### Base de datos — `server/db/migrations/007_inventario.sql`

- `products`: nombre, código, categoría, precio sugerido, costo, existencia mínima, `tracks_units` (motos), `stock`, activo.
- `product_units`: cada moto con `serial` (chasis), `engine_number` y `status` (`disponible` · `vendida` · `baja`).
- `inventory_movements`: el kárdex. `quantity` con signo (+ entra, − sale), `stock_after`, `kind`, y de dónde vino (`sale_id`, `workshop_order_id`, `note`).
- `sale_items.product_id`, `sale_items.unit_id` y `workshop_order_items.product_id` (opcionales, para la parte B).

Lo que protege la **base de datos** (aunque alguien salte el servidor):

- `products.stock` nunca baja de 0 (`products_stock_nonnegative`).
- Una moto solo puede estar en **una** línea de venta (`sale_items_unit_key`) y esa línea es de cantidad 1 (`sale_items_unit_single`).
- Las existencias de una moto se recalculan solas con un trigger (= sus unidades `disponible`).
- El kárdex no se puede editar ni borrar.

### API — `/api/inventory`

| Método y ruta | Quién | Para qué |
|---|---|---|
| `GET /products` | los dos | Lista paginada (`search`, `categoryId`, `status`, `lowStock`). El Empleado no recibe `cost`. |
| `GET /products/search?q=` | los dos | **Búsqueda rápida para elegir un producto al vender** (nombre, código o chasis; solo activos; máx. 10). |
| `GET /products/:id` | los dos | Detalle con sus unidades. |
| `GET /products/:id/units` | los dos | **Motos disponibles de un producto, para elegir el chasis.** |
| `GET /summary` | Admin | Totales para la pantalla (bajas, agotados, valor). |
| `POST /products` · `PUT /products/:id` · `PATCH /products/:id/active` | Admin | Alta, edición, activar/desactivar. |
| `POST /products/:id/entries` | Admin | Entrada: `{ quantity }` o, para motos, `{ units: [{ serial, engineNumber? }] }`. |
| `POST /products/:id/adjustments` | Admin | Ajuste por conteo: `{ countedStock, reason }`. |
| `GET /products/:id/movements` | Admin | Kárdex paginado. |
| `PATCH /units/:unitId` · `POST /units/:unitId/retire` | Admin | Corregir chasis / dar de baja una moto disponible (`wasError: true` = se registró por error: su costo sale del gasto). |
| `POST /movements/:movementId/correct` | Admin | Corregir una entrada mal registrada: `{ quantity, unitCost?, reason }`. |

En el frontend todo esto está en `src/api/inventory.ts` (`inventoryApi.search`, `inventoryApi.availableUnits`, etc.).

### El motor de existencias — `server/src/modules/inventory/inventory.service.ts`

**Es lo único que debe cambiar existencias por ventas o taller.** Se llama **dentro de la transacción** de la venta o de la orden, pasándole su `db`: si algo falla después, el `ROLLBACK` deshace también las existencias.

```ts
import * as inventoryService from "../inventory/inventory.service";

// Saca: producto normal → resta si alcanza; moto → la unidad pasa a "vendida"
await inventoryService.takeStock(db, req, { productId, quantity, unitId }, "venta", { saleId });
await inventoryService.takeStock(db, req, { productId, quantity }, "taller", { workshopOrderId });

// Regresa lo que salió (funciona aunque el producto ya esté desactivado)
await inventoryService.returnStock(db, req, { productId, quantity, unitId }, "devolucion_venta", { saleId });
await inventoryService.returnStock(db, req, { productId, quantity }, "devolucion_taller", { workshopOrderId });
```

Ya resuelve, y tiene pruebas:

- "Solo quedan N de …" (409) si no alcanza, sin cambiar nada.
- **Dos ventas a la vez** por la última pieza: una pasa y la otra recibe 409 (bloquea la fila del producto).
- La misma moto no se vende dos veces, y una moto no se usa como repuesto de taller.
- Producto desactivado → no se puede sacar, pero sí devolver.
- Deja el movimiento en el kárdex con `saleId` / `workshopOrderId`.

No revisa permisos: eso lo hace quien lo llama (ventas y taller ya lo hacen).

## Parte B — lo que falta (Fernanda)

### 1. Esquema compartido — `shared/schemas/sales.ts` y `workshop.ts`

- [ ] `saleItemInputSchema`: agregar `productId?: number` y `unitId?: number` (enteros positivos, opcionales).
- [ ] `SaleItem` (salida): agregar `productId: number | null`, `unitId: number | null`, `unitSerial: string | null`.
- [ ] `workshopItemInputSchema`: agregar `productId?: number`. `WorkshopOrderItem`: `productId`.

### 2. Ventas — `server/src/modules/sales/`

- [ ] **`createSale`**: después de `insertSale` + `insertItems` (para tener el `saleId`), por cada línea con `productId` y `origin = "venta"`: `takeStock(db, req, línea, "venta", { saleId })`.
- [ ] En `resolveItems`, si la línea trae `productId`:
  - la **categoría sale del producto** (el servidor la pone, no la del cliente);
  - el precio sí puede ser otro (es el sugerido), y la descripción es lo que mande el cliente (se llena con el nombre del producto);
  - si el producto es por unidad, `unitId` es obligatorio y `quantity` debe ser 1 (el motor también lo valida).
- [ ] **`deleteSale`**: antes de borrar, por cada línea con `productId` y `origin = "venta"`: `returnStock(..., "devolucion_venta", { saleId })`. Las líneas del taller **no** se devuelven: la orden vuelve a "Lista para entregar" y sus repuestos siguen apartados para ella.
- [ ] **`updateSale`**: comparar antes y después **por producto (y unidad)**. Regresar lo que se quitó o bajó (`devolucion_venta`) y sacar lo que se agregó o subió (`venta`). Si las cantidades no cambiaron, no se mueve nada (así el kárdex no se llena de movimientos falsos).
- [ ] Líneas que vienen del taller (`origin` `taller_*`) con producto: al editar la venta se puede cambiar el precio, pero **no** el producto ni la cantidad (sus existencias son de la orden). Validarlo en el servidor.
- [ ] `insertItems` y `findDetail` en `sales.repository.ts`: guardar y leer `product_id`, `unit_id` (y el `serial` con un JOIN a `product_units`).
- [ ] Período cerrado: no hay que hacer nada. La base ya bloquea editar o borrar esas ventas, y el `ROLLBACK` deshace las existencias.

### 3. Taller — `server/src/modules/workshop/`

- [ ] **`addItem`**: si trae `productId`, `takeStock(db, req, { productId, quantity }, "taller", { workshopOrderId })` y guardar `product_id` en `workshop_order_items`. La categoría sale del producto.
- [ ] **`removeItem`**: si el item tenía producto, `returnStock(..., "devolucion_taller", { workshopOrderId })`.
- [ ] **`checkout`**: copiar `productId` a cada línea de la venta (origen `taller_repuesto`), pero **sin** volver a sacar existencias: ya salieron al agregarlos. Si en `createSale` se llama al motor solo para `origin = "venta"`, esto queda resuelto.

### 4. Pantallas

- [ ] **Nueva venta** (`ItemsTable.tsx`): en la descripción, un buscador que usa `inventoryApi.search(q)` (con `useDebouncedValue`). Al elegir: llena la descripción, la categoría (bloqueada) y el precio sugerido, y muestra "quedan N". Si es moto, una lista con `inventoryApi.availableUnits(id)` para elegir el chasis (y la cantidad queda en 1). Escribir sin elegir = línea libre, como hoy.
- [ ] **Editar venta** (`EditSaleModal.tsx`): lo mismo, respetando lo de las líneas del taller.
- [ ] **Taller** (`OrderItemsCard.tsx`): buscador de repuestos del inventario (sin motos).
- [ ] **Factura / documento de venta** (`InvoicePreview`): mostrar el **chasis** (y motor) de las motos vendidas. El proceso actual de la tienda entrega la moto con número de chasis y factura.
- [ ] Mensajes de error del motor (409): mostrarlos tal cual en el formulario (`FormError`).

### 5. Avisos (opcional, pero recomendado)

- [ ] Campanita (`src/layout/NotificationBell.tsx`): agregar "N productos con existencias bajas" con `inventoryApi.summary()` y un enlace a `/inventario?bajas=1`.
- [ ] Dashboard: una tarjeta de existencias bajas.

### 6. Pruebas — en `server/tests/sales.test.ts` (no en otro archivo: la prueba borra la base al empezar)

- [ ] Vender un producto descuenta, y una moto queda vendida y en el detalle de la venta con su chasis.
- [ ] Sin existencias → 409 y **no queda la venta** guardada.
- [ ] Eliminar la venta devuelve existencias (y la moto vuelve a disponible).
- [ ] Editar: cambiar cantidades mueve solo la diferencia; quitar una línea la devuelve.
- [ ] Taller: agregar repuesto aparta, quitarlo devuelve, cobrar no vuelve a descontar, eliminar la venta del taller no devuelve.
- [ ] El Empleado puede vender productos del inventario.
- [ ] Ventas sin productos (líneas libres) siguen funcionando igual.

## Entradas como gasto y su corrección (migración 008)

- Al registrar una entrada con costo se puede crear también el gasto (categoría **Mercadería**). El gasto queda ligado a cada movimiento de la entrada (`inventory_movements.expense_id`).
- **Corregir una entrada** (40 en vez de 4) no edita el kárdex: crea un movimiento `correccion` que apunta a la entrada (`corrects_movement_id`), mueve solo la diferencia de existencias y corrige el gasto **por diferencia**, para respetar lo que se haya cambiado a mano en Gastos. Si la entrada queda en 0, el gasto se elimina.
- No deja bajar una entrada por debajo de lo que ya salió (409 "lo mínimo que puede quedar es N").
- Una moto registrada por error se da de baja con `wasError`: sale solo su costo del gasto de esa entrada (que puede cubrir varias motos).

## Despliegue (importante)

Render despliega `main` automáticamente. **Antes de que llegue a `main`, hay que aplicar las migraciones 007 y 008 en Supabase** (la 007 ya está aplicada) (`pnpm db:migrate` con la `DATABASE_URL` de producción, o pegando el archivo en el SQL Editor). Si el código llega primero, la pantalla Inventario falla hasta que se aplique.
