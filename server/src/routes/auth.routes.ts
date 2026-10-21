import { Router } from "express";
import { AuthController } from "../controllers/auth.controller";
import { authMiddleware, requireAdmin } from "../middlewares/auth.middleware";

const router = Router();

router.post("/login", AuthController.login);
router.get("/status", AuthController.getStatus);
router.post("/seed", AuthController.seed);
router.get("/me", authMiddleware, AuthController.getMe);
router.post("/register", authMiddleware, requireAdmin, AuthController.register);

export default router;
