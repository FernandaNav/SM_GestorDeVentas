import { Router } from "express";
import { DashboardController } from "../controllers/dashboard.controller";

const router = Router();
router.get("/summary", DashboardController.getSummary);
router.get("/sellers", DashboardController.getSellers);
router.get("/sales-vs-expenses", DashboardController.getSalesVsExpenses);
router.post("/sale", DashboardController.createSale);

export default router;
