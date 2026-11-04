import { Router } from "express";
import { idParamSchema, paginationSchema } from "@shared/schemas/common";
import {
  createWorkshopOrderSchema,
  workshopCheckoutSchema,
  workshopHistoryFiltersSchema,
  workshopItemInputSchema,
  workshopItemParamsSchema,
  workshopStatusChangeSchema,
} from "@shared/schemas/workshop";
import { currentUser } from "../../middlewares/auth";
import * as workshopService from "./workshop.service";

// Taller (RF 8.1). Los dos roles crean, avanzan y cobran órdenes; la respuesta del cobro
// trae la venta ya filtrada por rol (el Empleado no recibe comisiones).
export const workshopRouter = Router();

// Órdenes que siguen en el taller (Recibida, En reparación, Lista para entregar)
workshopRouter.get("/", async (_req, res) => {
  res.json(await workshopService.listActive());
});

// Entregadas, paginadas: ?search=...&page=1&pageSize=20. Van antes de /:id.
// El empleado solo recibe las de hoy (RNF 1.3), aquí, en el resumen y en el detalle.
workshopRouter.get("/history", async (req, res) => {
  const filters = workshopHistoryFiltersSchema.parse(req.query);
  res.json(await workshopService.listHistory(filters, paginationSchema.parse(req.query), currentUser(req).role));
});

workshopRouter.get("/summary", async (req, res) => {
  res.json(await workshopService.summary(currentUser(req).role));
});

workshopRouter.post("/", async (req, res) => {
  const created = await workshopService.create(createWorkshopOrderSchema.parse(req.body), req);
  res.status(201).json(created);
});

workshopRouter.get("/:id", async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  res.json(await workshopService.get(id, currentUser(req).role));
});

workshopRouter.post("/:id/items", async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  res.status(201).json(await workshopService.addItem(id, workshopItemInputSchema.parse(req.body), req));
});

workshopRouter.delete("/:id/items/:itemId", async (req, res) => {
  const { id, itemId } = workshopItemParamsSchema.parse(req.params);
  res.json(await workshopService.removeItem(id, itemId, req));
});

workshopRouter.patch("/:id/status", async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const { status } = workshopStatusChangeSchema.parse(req.body);
  res.json(await workshopService.changeStatus(id, status, req));
});

workshopRouter.post("/:id/checkout", async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  res.status(201).json(await workshopService.checkout(id, workshopCheckoutSchema.parse(req.body), req));
});
