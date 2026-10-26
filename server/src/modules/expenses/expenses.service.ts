import type { Request } from "express";
import type { DateRange } from "@shared/schemas/common";
import type { Expense, ExpenseInput } from "@shared/schemas/expenses";
import { pool, withTransaction } from "../../db/pool";
import { recordAudit } from "../../lib/audit";
import { notFound } from "../../lib/http-error";
import { currentUser } from "../../middlewares/auth";
import * as expensesRepository from "./expenses.repository";

export function list(range: DateRange): Promise<Expense[]> {
  return expensesRepository.findByRange(pool, range);
}

export function create(input: ExpenseInput, req: Request): Promise<Expense> {
  return withTransaction(async (db) => {
    const created = await expensesRepository.insert(db, input, currentUser(req).id);
    await recordAudit(db, req, { action: "crear", entity: "expenses", entityId: created.id, after: created });
    return created;
  });
}

export function remove(id: number, req: Request): Promise<void> {
  return withTransaction(async (db) => {
    const before = await expensesRepository.findById(db, id);
    if (!before) throw notFound("Gasto");
    await expensesRepository.remove(db, id);
    await recordAudit(db, req, { action: "eliminar", entity: "expenses", entityId: id, before });
  });
}