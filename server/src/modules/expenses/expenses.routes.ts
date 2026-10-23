import { Router } from "express";
import { dateRangeSchema, idParamSchema } from "@shared/schemas/common";
import { expenseInputSchema } from "@shared/schemas/expenses";
import { requireRole } from "../../middlewares/auth";
import * as expensesService from "./expenses.service";

// Los gastos son información financiera: solo el Administrador (RNF 1.3)
export const expensesRouter = Router();
expensesRouter.use(requireRole("Administrador"));

expensesRouter.get("/", async (req, res) => {
  res.json(await expensesService.list(dateRangeSchema.parse(req.query)));
});

expensesRouter.post("/", async (req, res) => {
  res.status(201).json(await expensesService.create(expenseInputSchema.parse(req.body), req));
});

expensesRouter.delete("/:id", async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  await expensesService.remove(id, req);
  res.status(204).end();
});