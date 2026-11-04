import { Router } from "express";
import { dateRangeSchema, idParamSchema, paginationSchema } from "@shared/schemas/common";
import { expenseAreaFilterSchema, expenseInputSchema } from "@shared/schemas/expenses";
import { requireRole } from "../../middlewares/auth";
import * as expensesService from "./expenses.service";

// Los gastos son información financiera: solo el Administrador (RNF 1.3)
export const expensesRouter = Router();
expensesRouter.use(requireRole("Administrador"));

// ?from=AAAA-MM-DD&to=AAAA-MM-DD&area=Taller&page=1&pageSize=20 (área y página son opcionales)
expensesRouter.get("/", async (req, res) => {
  const range = dateRangeSchema.parse(req.query);
  const { area } = expenseAreaFilterSchema.parse(req.query);
  const pagination = paginationSchema.parse(req.query);
  res.json(await expensesService.list(range, area, pagination));
});

expensesRouter.post("/", async (req, res) => {
  res.status(201).json(await expensesService.create(expenseInputSchema.parse(req.body), req));
});

expensesRouter.delete("/:id", async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  await expensesService.remove(id, req);
  res.status(204).end();
});