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
