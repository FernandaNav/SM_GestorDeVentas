import { createClient, SupabaseClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "server", ".env") });

const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseKey =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  "";

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseKey &&
  !supabaseUrl.includes("TU_PROYECTO") &&
  !supabaseKey.includes("TU_SUPABASE")
);

if (!isSupabaseConfigured) {
  console.warn(
    "\n[AVISO] [SoloMotos Backend] SUPABASE NO CONFIGURADO:\n" +
    "Por favor ingresa tu SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (o SUPABASE_ANON_KEY) en tu archivo .env\n"
  );
}
export const supabase: SupabaseClient = createClient(
  isSupabaseConfigured ? supabaseUrl : "https://placeholder.supabase.co",
  isSupabaseConfigured ? supabaseKey : "placeholder-key",
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

export async function testSupabaseConnection(): Promise<{ ok: boolean; message: string; details?: any }> {
  if (!isSupabaseConfigured) {
    return {
      ok: false,
      message: "Credenciales de Supabase pendientes en archivo .env",
    };
  }

  try {
    const { error } = await supabase.from("users").select("id", { head: true, count: "exact" });
    if (error) {
      if (error.code === "42P01") {
        return {
          ok: true,
          message:
            "Conectado a Supabase, pero la tabla 'users' no existe todavía. Ejecuta el archivo server/db/schema.sql en el SQL Editor de Supabase.",
        };
      }
      return {
        ok: false,
        message: `Error al consultar Supabase: ${error.message} (Código: ${error.code})`,
      };
    }
    return {
      ok: true,
      message: "Conexion a Supabase y tabla 'users' verificada correctamente.",
    };
  } catch (err: any) {
    return {
      ok: false,
      message: `Error de red al conectar con Supabase: ${err.message}`,
    };
  }
}
