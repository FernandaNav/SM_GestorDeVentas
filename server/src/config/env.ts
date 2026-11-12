import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({ quiet: true });

// Si falta una variable obligatoria el servidor no arranca: es mejor fallar al inicio
// que firmar sesiones con una clave por defecto.
const envSchema = z.object({
  DATABASE_URL: z.string().url("DATABASE_URL debe ser una cadena de conexión válida"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET debe tener al menos 32 caracteres"),
  API_PORT: z.coerce.number().int().positive().default(3001),
  CORS_ORIGIN: z.string().default("http://localhost:8443"),
  // Cuántos proxies hay delante del servidor (en Render, 1). Sin esto todas las computadoras
  // llegarían con la IP del proxy y el límite de intentos de login las bloquearía juntas.
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
});

// Render y servicios parecidos asignan el puerto en PORT; en el negocio se usa API_PORT
const parsed = envSchema.safeParse({ ...process.env, API_PORT: process.env.API_PORT ?? process.env.PORT });

if (!parsed.success) {
  console.error("\nConfiguración inválida en .env (revisa .env.example):");
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
