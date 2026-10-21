import express from "express";
import AuthCtrl from "./auth.controller";
import { authenticate } from "../../middleware/auth.middleware";

// Everything else under /auth is Better Auth's, handled in app.ts before this
// router is reached. See docs/BETTER-AUTH-CONSOLIDATION.md.
const router = express.Router();

router.post("/socket-ticket", authenticate, AuthCtrl.socketTicket);

export default router;
