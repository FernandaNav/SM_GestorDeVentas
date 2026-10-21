import { Router } from "express";
import { pool } from "../../db/pool";
import { currentUser } from "../../middlewares/auth";
import * as categoriesRepository from "./categories.repository";

// Solo lectura por ahora. Editar las comisiones por categoría es parte del módulo
// Configuración (ver docs/MODULOS.md).
export const categoriesRouter = Router();

categoriesRouter.get("/", async (req, res) => {
  const onlyActive = currentUser(req).role !== "Administrador";
  res.json(await categoriesRepository.findAll(pool, { onlyActive }));
});
