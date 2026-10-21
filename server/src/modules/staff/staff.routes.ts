import { Router } from "express";
import { idParamSchema } from "@shared/schemas/common";
import { staffActiveSchema, staffFiltersSchema, staffInputSchema } from "@shared/schemas/staff";
import { currentUser, requireRole } from "../../middlewares/auth";
import * as staffService from "./staff.service";

export const staffRouter = Router();

staffRouter.get("/", async (req, res) => {
  const filters = staffFiltersSchema.parse(req.query);
  res.json(await staffService.list(filters, currentUser(req).role));
});

staffRouter.post("/", requireRole("Administrador"), async (req, res) => {
  const created = await staffService.create(staffInputSchema.parse(req.body), req);
  res.status(201).json(created);
});

staffRouter.put("/:id", requireRole("Administrador"), async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  res.json(await staffService.update(id, staffInputSchema.parse(req.body), req));
});

staffRouter.patch("/:id/active", requireRole("Administrador"), async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const { isActive } = staffActiveSchema.parse(req.body);
  res.json(await staffService.setActive(id, isActive, req));
});
