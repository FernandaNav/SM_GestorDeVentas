import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { HttpError } from "../lib/http-error";

type PgError = Error & { code?: string; hint?: string };

// Todas las respuestas de error tienen la forma { error: string, fields?: {...} }.
export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message });
    return;
  }

  if (error instanceof ZodError) {
    const fields = Object.fromEntries(error.issues.map((issue) => [issue.path.join(".") || "_", issue.message]));
    res.status(400).json({ error: "Revisa los datos ingresados", fields });
    return;
  }

  const pgError = error as PgError;
  if (pgError.hint === "periodo_cerrado") {
    res.status(409).json({ error: pgError.message });
    return;
  }
  if (pgError.code === "23505") {
    res.status(409).json({ error: "Ya existe un registro con esos datos" });
    return;
  }
  if (pgError.code === "23503") {
    res.status(400).json({ error: "Uno de los datos seleccionados no existe" });
    return;
  }

  console.error(error);
  res.status(500).json({ error: "Ocurrió un error inesperado. Intenta de nuevo" });
}
