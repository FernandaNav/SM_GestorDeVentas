import cors from "cors";
import express from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { env } from "./config/env";
import { authenticate } from "./middlewares/auth";
import { errorHandler } from "./middlewares/error-handler";
import { authRouter } from "./modules/auth/auth.routes";
import { categoriesRouter } from "./modules/categories/categories.routes";
import { commissionsRouter } from "./modules/commissions/commissions.routes";
import { reportsRouter } from "./modules/reports/reports.routes";
import { closuresRouter } from "./modules/closures/closures.routes";
import { expensesRouter } from "./modules/expenses/expenses.routes";
import { inventoryRouter } from "./modules/inventory/inventory.routes";
import { salesRouter } from "./modules/sales/sales.routes";
import { settingsRouter } from "./modules/settings/settings.routes";
import { staffRouter } from "./modules/staff/staff.routes";
import { workshopRouter } from "./modules/workshop/workshop.routes";

export const app = express();

app.set("trust proxy", env.TRUST_PROXY);
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
app.use("/api/expenses", expensesRouter);
app.use("/api/workshop", workshopRouter);
app.use("/api/inventory", inventoryRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/commissions", commissionsRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/closures", closuresRouter);

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Ruta no encontrada" });
});

// En producción el mismo servidor entrega el frontend compilado (pnpm build),
// así las dos estaciones solo necesitan abrir http://<servidor>:<API_PORT>.
// dist/ se busca en la carpeta desde donde se arranca y, si no está, junto al servidor
// compilado (dist-server/index.cjs): un hosting puede arrancar la app desde otra carpeta.
const distCandidates = [path.resolve(process.cwd(), "dist")];
if (typeof __dirname !== "undefined") distCandidates.push(path.resolve(__dirname, "..", "dist"));
const distDir = distCandidates.find((dir) => existsSync(path.join(dir, "index.html")));
if (distDir) {
  app.use(express.static(distDir));
  app.get("/{*path}", (_req, res) => res.sendFile(path.join(distDir, "index.html")));
}

app.use(errorHandler);