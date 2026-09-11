import { Router } from "express";
import ReportsController from "./reports.controller";
import { authenticate } from "../../middleware/auth.middleware";

const router = Router();

router.post("/", authenticate, ReportsController.fileReport);

export default router;
