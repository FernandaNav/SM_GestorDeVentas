import cors from "cors";
import express from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { env } from "./config/env";
import { authenticate } from "./middlewares/auth";
import { errorHandler } from "./middlewares/error-handler";
import { authRouter } from "./modules/auth/auth.routes";
import { categoriesRouter } from "./modules/categories/categories.routes";
import { salesRouter } from "./modules/sales/sales.routes";
import { staffRouter } from "./modules/staff/staff.routes";

export const app = express();

app.use(cors({ origin: env.CORS_ORIGIN }));
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", serverTime: new Date().toISOString() });
});

// Rutas públicas
app.use("/api/auth", authRouter);

// De aquí en adelante todo requiere sesión. Cada módulo agrega requireRole donde corresponda.
app.use("/api", authenticate);
app.use("/api/staff", staffRouter);
app.use("/api/categories", categoriesRouter);
app.use("/api/sales", salesRouter);

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Ruta no encontrada" });
});

// En producción el mismo servidor entrega el frontend compilado (pnpm build),
// así las dos estaciones solo necesitan abrir http://<servidor>:<API_PORT>.
const distDir = path.resolve(process.cwd(), "dist");
if (existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get("/{*path}", (_req, res) => res.sendFile(path.join(distDir, "index.html")));
}

app.use(errorHandler);
