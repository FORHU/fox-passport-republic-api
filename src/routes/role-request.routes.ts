import { Router } from "express";
import RoleRequestController from "../controllers/role-request.controller";
import { authenticate, requireAdmin } from "../middleware/auth.middleware";

const router = Router();

// User routes
router.post("/apply", authenticate, RoleRequestController.apply);

// Admin routes
router.get("/list", authenticate, requireAdmin, RoleRequestController.list);
router.patch("/review/:id", authenticate, requireAdmin, RoleRequestController.review);

export default router;
