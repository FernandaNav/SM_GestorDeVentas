import type { Request } from "express";
import type { ExpenseArea } from "@shared/constants";
import type { DateRange, Pagination } from "@shared/schemas/common";
import type { Expense, ExpenseInput, ExpenseList } from "@shared/schemas/expenses";
import { pool, withTransaction } from "../../db/pool";
import { recordAudit } from "../../lib/audit";
import { notFound } from "../../lib/http-error";
import { currentUser } from "../../middlewares/auth";
import * as expensesRepository from "./expenses.repository";

export async function list(range: DateRange, area: ExpenseArea | undefined, { page, pageSize }: Pagination): Promise<ExpenseList> {
  const areaFilter = area ?? null;
  const [totalItems, summary] = await Promise.all([
    expensesRepository.count(pool, range, areaFilter),
    expensesRepository.summarize(pool, range),
  ]);
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  // Si se borró el último gasto de la última página, se muestra la anterior en vez de una vacía
  const currentPage = Math.min(page, totalPages);
  const items = await expensesRepository.findPage(pool, range, areaFilter, pageSize, (currentPage - 1) * pageSize);
  return { items, page: currentPage, pageSize, totalItems, totalPages, summary };
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