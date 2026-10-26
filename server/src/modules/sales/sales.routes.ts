import { Router } from "express";
import { idParamSchema } from "@shared/schemas/common";
import { createSaleSchema, saleFiltersSchema, updateSaleSchema } from "@shared/schemas/sales";
import { currentUser, requireRole } from "../../middlewares/auth";
import * as salesService from "./sales.service";

export const salesRouter = Router();

// Los dos roles registran ventas (RF 6.5)
salesRouter.post("/", async (req, res) => {
  const sale = await salesService.createSale(createSaleSchema.parse(req.body), req);
  res.status(201).json(sale);
});

// Contador y alerta de facturas del mes (RF 1.7 / punto 5)
salesRouter.get("/invoice-usage", async (_req, res) => {
  res.json(await salesService.getInvoiceUsage());
});

// Autocompletar cliente por NIT o CUI (RNF 3.1)
salesRouter.get("/clients/:taxId", async (req, res) => {
  const client = await salesService.lookupClient(req.params.taxId);
  if (!client) {
    res.status(404).json({ error: "Cliente no encontrado" });
    return;
  }
  res.json(client);
});

// Consulta de historial con filtros. El empleado siempre recibe solo hoy (RNF 1.3).
salesRouter.get("/", async (req, res) => {
  const filters = saleFiltersSchema.parse(req.query);
  res.json(await salesService.listSales(filters, currentUser(req).role));
});

salesRouter.get("/:id", async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  res.json(await salesService.getSale(id, currentUser(req).role));
});

// Editar solo el Administrador, con bitácora (RF 6.2)
salesRouter.put("/:id", requireRole("Administrador"), async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const input = updateSaleSchema.parse(req.body);
  const updated = await salesService.updateSale(id, input, req);
  res.json(updated);
});

// Eliminar solo el Administrador, con bitácora (RF 6.2)
salesRouter.delete("/:id", requireRole("Administrador"), async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  await salesService.deleteSale(id, req);
  res.status(204).end();
});

