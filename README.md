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
| `pnpm build` | Compila el frontend en `dist/` |
| `pnpm server` | Backend sin recarga (producción). Si existe `dist/`, también entrega el frontend |
| `pnpm db:migrate` | Aplica las migraciones pendientes de `server/db/migrations/` |
| `pnpm db:seed-users` | Crea o reinicia las dos cuentas de acceso |
| `pnpm db:reset-password` | Cambia la contraseña de una cuenta desde el servidor (si se olvidó) |

## Puesta en marcha en el negocio

1. En la computadora de gerencia (o un servidor): `pnpm install`, `.env`, `pnpm build`, `pnpm server`.
2. En las dos estaciones se abre `http://<ip-de-esa-computadora>:3001`.
3. Cada estación ve los cambios de la otra en máximo 10 segundos.
