import { z } from "zod";
import { EXPENSE_CATEGORIES, type ExpenseCategory } from "../constants";

// Se calcula en hora de Guatemala para que la regla sea la misma en la pantalla y en el
// servidor, sin importar la zona horaria de cada computadora.
const todayInGuatemala = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guatemala" }).format(new Date());

export type Expense = {
  id: number;
  /** AAAA-MM-DD */
  spentOn: string;
  amount: number;
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
  category: z.enum(EXPENSE_CATEGORIES, { message: "Elige una categoría" }),
  description: z.string().trim().min(3, "Describe el gasto").max(200, "Máximo 200 caracteres"),
});
export type ExpenseInput = z.infer<typeof expenseInputSchema>;