import { Router } from "express";
import { assignCommissionSchema, commissionFiltersSchema } from "@shared/schemas/commissions";
import { requireRole } from "../../middlewares/auth";
import * as commissionsService from "./commissions.service";

// Comisiones (RF 3.1 a 3.3). Todo el módulo es del Administrador (RNF 1.3).
export const commissionsRouter = Router();

commissionsRouter.use(requireRole("Administrador"));

// ?from=AAAA-MM-DD&to=AAAA-MM-DD
commissionsRouter.get("/sellers", async (req, res) => {
  const { from, to } = commissionFiltersSchema.parse(req.query);
  res.json(await commissionsService.listSellers({ from, to }));
});

// ?from&to &sellerId &status=todas|pendientes
commissionsRouter.get("/items", async (req, res) => {
  res.json(await commissionsService.listItems(commissionFiltersSchema.parse(req.query)));
});

// { itemIds: [12, 13], commissionRate: 4 }
commissionsRouter.post("/assign", async (req, res) => {
  res.json(await commissionsService.assignPending(assignCommissionSchema.parse(req.body), req));
});
