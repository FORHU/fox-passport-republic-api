import express from "express";
import PayoutCtrl from "./payout.controller";
import { authenticate } from "../../middleware/auth.middleware";

const router = express.Router();

// Any authenticated user may read their own payout ledger — there's nothing
// role-gated to check here since the query is always scoped to req.user's
// own id, never an arbitrary providerId from the request.
router.get("/me", authenticate, PayoutCtrl.getMyPayouts);

export default router;
