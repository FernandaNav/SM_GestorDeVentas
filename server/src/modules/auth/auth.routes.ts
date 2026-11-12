import { Router } from "express";
import { changePasswordSchema, loginSchema, recoverPasswordSchema } from "@shared/schemas/auth";
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

// Sin sesión: el Administrador olvidó su contraseña y usa su código de recuperación.
// Responde con el código nuevo, porque el que se usó ya no sirve.
authRouter.post("/recover", async (req, res) => {
  const recoveryCode = await authService.recoverAdminPassword(recoverPasswordSchema.parse(req.body), req.ip ?? "desconocida");
  res.json({ recoveryCode });
});

// Configuración: si ya hay un código guardado (nunca se devuelve el código en sí)
authRouter.get("/recovery-code", authenticate, requireRole("Administrador"), async (_req, res) => {
  res.json(await authService.getRecoveryCodeStatus());
});

// Configuración: crea un código nuevo y lo muestra esta única vez
authRouter.post("/recovery-code", authenticate, requireRole("Administrador"), async (req, res) => {
  const { code, userId } = await authService.createRecoveryCode();
  await recordAudit(pool, req, { action: "generar_codigo_recuperacion", entity: "users", entityId: userId });
  res.json({ recoveryCode: code });
});

// El administrador puede cambiar su contraseña y la del empleado; si olvida la suya, usa el código de recuperación
authRouter.put("/password", authenticate, requireRole("Administrador"), async (req, res) => {
  const { role, newPassword } = changePasswordSchema.parse(req.body);
  const userId = await authService.changePassword(role, newPassword);
  await recordAudit(pool, req, { action: "cambiar_contraseña", entity: "users", entityId: userId });
  // Cambiar una contraseña cierra las sesiones de esa cuenta; si fue la propia, esta sigue con un token nuevo
  const isOwnPassword = role === currentUser(req).role;
  res.json({ token: isOwnPassword ? await authService.issueSessionToken(userId) : null });
});
