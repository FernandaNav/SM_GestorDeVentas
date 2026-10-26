import { Router } from "express";
import { statsFiltersSchema } from "@shared/schemas/reports";
import { requireRole } from "../../middlewares/auth";
import * as reportsService from "./reports.service";

// Reportes (paquete D). Dashboard y estadísticas muestran la salud financiera del negocio,
// así que son solo del Administrador (RNF 1.3). El inicio del empleado no lleva montos.
export const reportsRouter = Router();

reportsRouter.get("/dashboard", requireRole("Administrador"), async (_req, res) => {
  res.json(await reportsService.getDashboard());
});

// ?from&to (obligatorios) &paymentMethod &sellerId &categoryId &compareFrom&compareTo
reportsRouter.get("/stats", requireRole("Administrador"), async (req, res) => {
  res.json(await reportsService.getStats(statsFiltersSchema.parse(req.query)));
});

reportsRouter.get("/home", async (_req, res) => {
  res.json(await reportsService.getEmployeeHome());
});
