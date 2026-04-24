import express from "express";
import AdminCtrl from "../controllers/admin.controller";
import { authenticate, requireAdmin } from "../middleware/auth.middleware";

const router = express.Router();

router.get("/stats", authenticate, requireAdmin, AdminCtrl.getStats);

export default router;
