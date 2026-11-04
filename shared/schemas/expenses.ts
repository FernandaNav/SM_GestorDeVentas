import { z } from "zod";
import { EXPENSE_AREAS, EXPENSE_CATEGORIES, type ExpenseArea, type ExpenseCategory } from "../constants";
import type { Page } from "./common";

// Se calcula en hora de Guatemala para que la regla sea la misma en la pantalla y en el
// servidor, sin importar la zona horaria de cada computadora.
const todayInGuatemala = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guatemala" }).format(new Date());

export type Expense = {
  id: number;
  /** AAAA-MM-DD */
  spentOn: string;
  amount: number;
  area: ExpenseArea;
  category: ExpenseCategory;
  description: string;
};

export const expenseInputSchema = z.object({
  spentOn: z
    .string()
    .date("Fecha inválida (usa AAAA-MM-DD)")
    .refine((date) => date <= todayInGuatemala(), "La fecha no puede ser futura"),
  amount: z
    .number({ message: "Ingresa un monto" })
    .positive("El monto debe ser mayor a 0")
    .max(10_000_000, "Monto demasiado alto")
    .multipleOf(0.01, "Máximo dos decimales"),
  area: z.enum(EXPENSE_AREAS, { message: "Elige Tienda o Taller" }),
  category: z.enum(EXPENSE_CATEGORIES, { message: "Elige una categoría" }),
  description: z.string().trim().min(3, "Describe el gasto").max(200, "Máximo 200 caracteres"),
});
export type ExpenseInput = z.infer<typeof expenseInputSchema>;

/** Filtro opcional por área en la URL: ?area=Taller. Sin enviar = las dos. */
export const expenseAreaFilterSchema = z.object({
  area: z.enum(EXPENSE_AREAS, { message: "Área inválida (usa Tienda o Taller)" }).optional(),
});

/**
 * Una página de gastos más los totales de TODO el rango (no solo de la página),
 * para que el total del mes no cambie al pasar de página.
 */
export type ExpenseList = Page<Expense> & {
  summary: { total: number; byArea: Record<ExpenseArea, number> };
};