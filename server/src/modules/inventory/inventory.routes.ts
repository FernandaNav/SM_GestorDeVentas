import { Router } from "express";
import { idParamSchema, paginationSchema } from "@shared/schemas/common";
import {
  productActiveSchema,
  productFiltersSchema,
  productInputSchema,
  productSearchSchema,
  stockAdjustmentSchema,
  stockEntrySchema,
  unitParamsSchema,
  unitRetireSchema,
  unitUpdateSchema,
} from "@shared/schemas/inventory";
import { currentUser, requireRole } from "../../middlewares/auth";
import * as inventoryService from "./inventory.service";

// Inventario. El Empleado consulta productos, existencias y motos disponibles para vender
// (sin costos); todo lo que cambia el inventario a mano es del Administrador (RNF 1.2).
export const inventoryRouter = Router();
const adminOnly = requireRole("Administrador");

// ─── consulta (los dos roles) ───────────────────────────────────────────────

// ?search &categoryId &status=activos|inactivos|todos &lowStock=true &page &pageSize
inventoryRouter.get("/products", async (req, res) => {
  res.json(await inventoryService.listProducts(productFiltersSchema.parse(req.query), paginationSchema.parse(req.query), currentUser(req).role));
});

// Para elegir un producto al vender o en el taller: ?q=casco
inventoryRouter.get("/products/search", async (req, res) => {
  res.json(await inventoryService.searchOptions(productSearchSchema.parse(req.query).q));
});

inventoryRouter.get("/products/:id", async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  res.json(await inventoryService.getProduct(id, currentUser(req).role));
});

// Motos disponibles de un producto, para elegir el chasis al vender
inventoryRouter.get("/products/:id/units", async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  res.json(await inventoryService.listAvailableUnits(id));
});

// ─── Administrador ──────────────────────────────────────────────────────────

inventoryRouter.get("/summary", adminOnly, async (_req, res) => {
  res.json(await inventoryService.summary());
});

inventoryRouter.post("/products", adminOnly, async (req, res) => {
  res.status(201).json(await inventoryService.createProduct(productInputSchema.parse(req.body), req));
});

inventoryRouter.put("/products/:id", adminOnly, async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  res.json(await inventoryService.updateProduct(id, productInputSchema.parse(req.body), req));
});

inventoryRouter.patch("/products/:id/active", adminOnly, async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  res.json(await inventoryService.setActive(id, productActiveSchema.parse(req.body).isActive, req));
});

// { quantity, unitCost?, note? }  o, para motos, { units: [{ serial, engineNumber? }], unitCost?, note? }
inventoryRouter.post("/products/:id/entries", adminOnly, async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  res.status(201).json(await inventoryService.addEntry(id, stockEntrySchema.parse(req.body), req));
});

// { countedStock, reason }
inventoryRouter.post("/products/:id/adjustments", adminOnly, async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  res.status(201).json(await inventoryService.adjustStock(id, stockAdjustmentSchema.parse(req.body), req));
});

// ?page &pageSize
inventoryRouter.get("/products/:id/movements", adminOnly, async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  res.json(await inventoryService.listMovements(id, paginationSchema.parse(req.query)));
});

// { serial, engineNumber? }
inventoryRouter.patch("/units/:unitId", adminOnly, async (req, res) => {
  const { unitId } = unitParamsSchema.parse(req.params);
  res.json(await inventoryService.updateUnit(unitId, unitUpdateSchema.parse(req.body), req));
});

// { reason }
inventoryRouter.post("/units/:unitId/retire", adminOnly, async (req, res) => {
  const { unitId } = unitParamsSchema.parse(req.params);
  res.json(await inventoryService.retireUnit(unitId, unitRetireSchema.parse(req.body).reason, req));
});
