# Backend de SoloMotos (Node.js + Express + Supabase)

Este directorio contiene el backend de la aplicación **SoloMotos**, desarrollado con **Node.js**, **Express**, **TypeScript** y **Supabase** como base de datos PostgreSQL en la nube.

---

## Estructura del Backend

```text
server/
├── db/
│   └── schema.sql             # Script SQL para crear tablas e índices en Supabase
├── src/
│   ├── config/
│   │   └── supabase.ts        # Conexión y cliente de Supabase
│   ├── controllers/
│   │   └── auth.controller.ts # Controladores para login, registro y perfil
│   ├── middlewares/
│   │   └── auth.middleware.ts # Verificación de JWT y validación de roles
│   ├── routes/
│   │   └── auth.routes.ts     # Rutas de autenticación (/api/auth)
│   ├── services/
│   │   └── auth.service.ts    # Lógica de negocio y consultas con Supabase
│   └── index.ts               # Servidor Express principal (puerto 3001)
├── .env                       # Variables de entorno (credenciales locales)
├── .env.example               # Plantilla de ejemplo
└── README.md                  # Esta documentación
```

---

## Pasos para Configurar Supabase

### 1. Obtener credenciales de Supabase
1. Ingresa a tu panel en [https://supabase.com](https://supabase.com).
2. Selecciona tu proyecto (o crea uno nuevo gratuito).
3. Ve a **Project Settings** (el icono de engranaje) > **API**.
4. Copia:
   - **Project URL** (ejemplo: `https://xyzcompany.supabase.co`)
   - **anon / public key**
   - **service_role key** (recomendada para el backend, ya que tiene permisos administrativos).

### 2. Configurar el archivo `.env`
Abre el archivo `.env` en la raíz del proyecto y coloca tus credenciales:

```env
PORT=3001
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_ANON_KEY=tu-anon-key-aqui
SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key-aqui
JWT_SECRET=tu_clave_secreta_jwt_personalizada_2026
```

### 3. Crear las tablas en Supabase
1. En tu consola de Supabase, ve a la sección **SQL Editor** en el menú izquierdo.
2. Haz clic en **New Query**.
3. Abre el archivo [`server/db/schema.sql`](file:///c:/Users/jralv/Documents/Sistemas%20e%20Inform%C3%A1tica%20-%20URL/Sexto%20Semestre%20-%20URL/Programaci%C3%B3n_Web/Proyecto_Final_PW/server/db/schema.sql), copia todo su contenido y pégalo en el editor de Supabase.
4. Presiona el botón **Run** (Ejecutar).

El script creará automáticamente las tablas: `users`, `settings`, `sales`, `expenses`, `workshop_orders`.

---

## Comandos para Ejecutar el Proyecto

Puedes usar `npm` o `pnpm`:

### Iniciar solo el backend:
```bash
npm run dev:server
```
El servidor backend iniciará en `http://localhost:3001`.

### Iniciar el backend y el frontend juntos:
```bash
npm run dev:all
```

---

## Endpoints de la API disponibles

### Autenticación (`/api/auth`)
| Método | Endpoint | Descripción | Requiere Auth |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | Estado del servidor y diagnóstico de Supabase | No |
| `GET` | `/api/auth/status` | Chequeo de conexión y estado de configuración | No |
| `POST` | `/api/auth/login` | Iniciar sesión (por correo o por rol + contraseña) | No |
| `GET` | `/api/auth/me` | Obtener datos del usuario autenticado actual | Sí (Bearer Token) |
| `POST` | `/api/auth/register`| Crear un nuevo usuario en la base de datos | Sí (Solo Administrador) |

### Dashboard (`/api/dashboard`)
| Método | Endpoint | Descripción | Requiere Auth |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/dashboard/summary` | KPIs (ventas día/mes, comisiones, gastos, facturas) y ventas recientes | No |
| `GET` | `/api/dashboard/sellers?month=current\|previous` | Desglose de ventas por vendedor según período seleccionado | No |
| `GET` | `/api/dashboard/sales-vs-expenses` | Datos temporales para la gráfica de ventas vs gastos | No |
| `POST` | `/api/dashboard/sale` | Registrar una nueva venta en base de datos para alimentar métricas | No |

---

## Modo Fallback (Desarrollo sin conexión inmediata)

Si ejecutas el backend antes de configurar las credenciales de Supabase en `.env`, el servidor entrará automáticamente en **Modo Fallback**:
- Te permitirá iniciar sesión con las contraseñas demo (`admin123` y `empleado123`).
- El frontend mostrará una etiqueta indicando que estás en **Modo Dev**.
- Tan pronto configures `.env`, el backend se conectará automáticamente a Supabase sin necesidad de modificar el código.
