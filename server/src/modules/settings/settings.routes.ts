import { Router } from "express";
import { idParamSchema } from "@shared/schemas/common";
import { categoryCommissionSchema, settingsInputSchema } from "@shared/schemas/settings";
import { requireRole } from "../../middlewares/auth";
import * as settingsService from "./settings.service";

export const settingsRouter = Router();

// Ambos roles: la factura que imprime el empleado necesita los datos de la empresa
settingsRouter.get("/", async (_req, res) => {
  res.json(await settingsService.get());
});

settingsRouter.put("/", requireRole("Administrador"), async (req, res) => {
  res.json(await settingsService.update(settingsInputSchema.parse(req.body), req));
});

// RNF 7.1: el administrador cambia la comisión por categoría sin tocar el código
settingsRouter.put("/categories/:id/commission", requireRole("Administrador"), async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const { defaultCommissionRate } = categoryCommissionSchema.parse(req.body);
  res.json(await settingsService.updateCategoryCommission(id, defaultCommissionRate, req));
});