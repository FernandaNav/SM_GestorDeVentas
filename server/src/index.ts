import express, { Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import authRoutes from "./routes/auth.routes";
import dashboardRoutes from "./routes/dashboard.routes";
import { testSupabaseConnection, isSupabaseConfigured } from "./config/supabase";
import { AuthService } from "./services/auth.service";

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "server", ".env") });

const app = express();
const PORT = process.env.PORT || 3001;

app.use(
  cors({
    origin: "*",
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api/auth", authRoutes);
app.use("/api/dashboard", dashboardRoutes);

app.get("/api/health", async (_req: Request, res: Response) => {
  const dbStatus = await testSupabaseConnection();
  res.json({
    status: "ok",
    service: "SoloMotos Backend API (Node.js)",
    supabase: dbStatus,
    timestamp: new Date().toISOString(),
  });
});

app.use((_req: Request, res: Response) => {
  res.status(404).json({
    ok: false,
    error: "Ruta no encontrada en la API de SoloMotos",
  });
});

app.listen(PORT, async () => {
  console.log(`\n======================================================`);
  console.log(`SERVIDOR BACKEND SOLOMOTOS (Node.js + Express)`);
  console.log(`URL Local: http://localhost:${PORT}`);
  console.log(`Salud de API: http://localhost:${PORT}/api/health`);
  console.log(`======================================================`);

  if (isSupabaseConfigured) {
    console.log(`Probando conexion con Supabase...`);
    const status = await testSupabaseConnection();
    if (status.ok) {
      console.log(`[OK] Supabase: ${status.message}`);
    } else {
      console.log(`[AVISO] Supabase: ${status.message}`);
    }
  } else {
    console.log(`[INFO] Supabase: Credenciales pendientes en archivo .env`);
    console.log(`   (El backend funcionara en modo desarrollo simulado con demo passwords)`);
  }
  console.log(`======================================================\n`);
});

export default app;
