# SoloMotos · Gestor de Ventas

Sistema web de ventas, taller y facturación para SoloMotos (Quetzaltenango). Se usa en dos computadoras a la vez: gerencia (Administrador) y mostrador (Empleado).

- **Frontend:** React 19 + Vite + TypeScript (`src/`)
- **Backend:** Node.js + Express + TypeScript (`server/`)
- **Base de datos:** PostgreSQL en Supabase, con SQL directo (`pg`)
- **Compartido:** validaciones y tipos usados por los dos lados (`shared/`)

La arquitectura, la forma de trabajo (ramas y pull requests) y el reparto de módulos están en el **documento técnico del equipo**.

## Requisitos

- Node.js 22 y pnpm 10 (`npm install -g pnpm`)
- Acceso al proyecto de Supabase del equipo (pide la cadena de conexión a quien lo administra)

## Primera vez

```bash
pnpm install
cp .env.example .env        # y llena DATABASE_URL y JWT_SECRET
pnpm db:migrate             # crea o actualiza las tablas
pnpm db:seed-users          # crea las cuentas Administrador y Empleado (pide las contraseñas)
```

`db:migrate` y `db:seed-users` solo hacen falta una vez por base de datos. Si el equipo comparte el mismo Supabase, solo lo hace una persona; los demás solo necesitan su `.env`.

## Desarrollo

```bash
pnpm dev:all                # frontend en http://localhost:8443 y API en http://localhost:3001
```

Vite redirige `/api` al backend, así que en el navegador solo se abre `http://localhost:8443`.

| Comando | Qué hace |
| --- | --- |
| `pnpm dev:all` | Frontend y backend juntos, con recarga automática |
| `pnpm typecheck` | Revisa tipos del frontend y del backend (debe pasar antes de cada PR) |
| `pnpm test` | Prueba ventas contra un PostgreSQL local (necesita `TEST_DATABASE_URL`, ver `.env.example`; esa base se borra) |
| `pnpm build` | Compila el frontend en `dist/` |
| `pnpm run server` | Backend sin recarga (producción; con `run`, porque `pnpm server` es otro comando de pnpm). Si existe `dist/`, también entrega el frontend |
| `pnpm db:migrate` | Aplica las migraciones pendientes de `server/db/migrations/` |
| `pnpm db:seed-users` | Crea o reinicia las dos cuentas de acceso |
| `pnpm db:reset-password` | Cambia la contraseña de una cuenta desde el servidor (si se olvidó) |

## Puesta en marcha en el negocio

1. En la computadora de gerencia (o un servidor): `pnpm install`, `.env`, `pnpm build`, `pnpm run server`.
2. En las dos estaciones se abre `http://<ip-de-esa-computadora>:3001`.
3. Cada estación ve los cambios de la otra en máximo 10 segundos.

## Despliegue en Render

`render.yaml` define un solo servicio que compila el frontend y lo entrega junto con la API.

1. En Render: **New > Blueprint** y elegir este repositorio (despliega la rama `main`).
2. Cuando lo pida, pegar en `DATABASE_URL` la cadena del **Session pooler** de Supabase. `JWT_SECRET` la genera Render.
3. La base ya debe tener las migraciones aplicadas (`pnpm db:migrate` desde una computadora con el `.env`).
   Si un cambio trae una migración nueva en `server/db/migrations/`, hay que correr `pnpm db:migrate` **antes** de fusionarlo a `main`.

### Acceso y soporte

- Si el Administrador olvida su contraseña, la cambia desde el login con su **código de recuperación** (se crea en Configuración y sirve una sola vez).
- "¿Necesitas ayuda?" del menú lateral y "Escríbenos" del login abren Gmail con un correo para `soporte.gestorventas@gmail.com`.

En el plan gratuito el servicio se duerme tras 15 minutos sin uso: la primera visita después tarda cerca de un minuto.
