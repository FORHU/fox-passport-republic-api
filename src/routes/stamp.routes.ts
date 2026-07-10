import express from "express";
import StampCtrl from "../controllers/stamp.controller";
import { authenticate } from "../middleware/auth.middleware";

const router = express.Router();

router.post("/", authenticate, StampCtrl.createStamp);
router.get("/", authenticate, StampCtrl.getStamps);

export default router;
