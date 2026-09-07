import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import BlockController from "./block.controller";

const router = Router();

router.post("/", authenticate, BlockController.blockUser);
router.delete("/:targetId", authenticate, BlockController.unblockUser);
router.get("/", authenticate, BlockController.getBlockedUsers);
router.get("/:userId/status", authenticate, BlockController.getStatus);

export default router;
