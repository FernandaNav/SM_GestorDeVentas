import { Router } from "express";
import { dateRangeSchema, idParamSchema } from "@shared/schemas/common";
import { createSaleSchema } from "@shared/schemas/sales";
import { todayInGuatemala } from "../../lib/dates";
import { currentUser } from "../../middlewares/auth";
import * as salesService from "./sales.service";

// Núcleo de ventas. Editar, eliminar y facturar (FEL) son parte del módulo Ventas
// (ver docs/MODULOS.md) y deben ir con requireRole("Administrador") y bitácora.
export const salesRouter = Router();

// Los dos roles registran ventas (RF 6.5)
salesRouter.post("/", async (req, res) => {
  const sale = await salesService.createSale(createSaleSchema.parse(req.body), req);
  res.status(201).json(sale);
});

// ?from=AAAA-MM-DD&to=AAAA-MM-DD (por defecto, hoy). El empleado siempre recibe solo hoy.
salesRouter.get("/", async (req, res) => {
  const today = todayInGuatemala();
  const range = dateRangeSchema.parse({ from: today, to: today, ...req.query });
  res.json(await salesService.listSales(range, currentUser(req).role));
});

salesRouter.get("/:id", async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  res.json(await salesService.getSale(id, currentUser(req).role));
});
