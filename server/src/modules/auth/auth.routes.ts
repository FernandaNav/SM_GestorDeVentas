import { Router } from "express";
import { changePasswordSchema, loginSchema } from "@shared/schemas/auth";
import { pool } from "../../db/pool";
import { recordAudit } from "../../lib/audit";
import { authenticate, currentUser, requireRole } from "../../middlewares/auth";
import * as authService from "./auth.service";

export const authRouter = Router();

authRouter.post("/login", async (req, res) => {
  const result = await authService.login(loginSchema.parse(req.body), req.ip ?? "desconocida");
  res.json(result);
});

authRouter.get("/me", authenticate, async (req, res) => {
  res.json(await authService.getUser(currentUser(req).id));
});

// El administrador puede cambiar su contraseña y la del empleado (no hay recuperación por correo)
authRouter.put("/password", authenticate, requireRole("Administrador"), async (req, res) => {
  const { role, newPassword } = changePasswordSchema.parse(req.body);
  const userId = await authService.changePassword(role, newPassword);
  await recordAudit(pool, req, { action: "cambiar_contraseña", entity: "users", entityId: userId });
  // Cambiar una contraseña cierra las sesiones de esa cuenta; si fue la propia, esta sigue con un token nuevo
  const isOwnPassword = role === currentUser(req).role;
  res.json({ token: isOwnPassword ? await authService.issueSessionToken(userId) : null });
});
