import { Router } from "express";
import { createClosureSchema, openPeriodQuerySchema } from "@shared/schemas/closures";
import { requireRole } from "../../middlewares/auth";
import * as closuresService from "./closures.service";

// El cierre y sus totales son solo del Administrador (RF 7.3, RNF 1.3)
export const closuresRouter = Router();
closuresRouter.use(requireRole("Administrador"));

// Totales del período abierto. ?to=AAAA-MM-DD para ver hasta otro día (por defecto, hoy)
closuresRouter.get("/open", async (req, res) => {
  const { to } = openPeriodQuerySchema.parse(req.query);
  res.json(await closuresService.getOpenPeriod(to));
});

closuresRouter.get("/", async (_req, res) => {
  res.json(await closuresService.list());
});

closuresRouter.post("/", async (req, res) => {
  res.status(201).json(await closuresService.close(createClosureSchema.parse(req.body), req));
});