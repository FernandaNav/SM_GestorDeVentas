import { z } from "zod";

/** Para rutas como /api/staff/:id */
export const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

/** Rango de fechas en la URL: ?from=2026-10-01&to=2026-10-31 (días de Guatemala, ambos incluidos). */
export const dateRangeSchema = z
  .object({
    from: z.string().date("Fecha inválida (usa AAAA-MM-DD)"),
    to: z.string().date("Fecha inválida (usa AAAA-MM-DD)"),
  })
  .refine(({ from, to }) => from <= to, { message: "La fecha inicial debe ser anterior a la final", path: ["to"] });
export type DateRange = z.infer<typeof dateRangeSchema>;


/** Página en la URL: ?page=2&pageSize=20. Sin enviar = primera página de 20. */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1, "Página inválida").default(1),
  pageSize: z.coerce.number().int().min(1).max(100, "Máximo 100 por página").default(20),
});
export type Pagination = z.infer<typeof paginationSchema>;

/** Respuesta paginada: los registros de una página y cuántos hay en total. */
export type Page<T> = {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};