import express from "express";

import sessionMiddleware from "../middleware/valid-session.middleware";
import authenticateToken from "../middleware/authenticate-token.middleware";
import ReceiptCtrl from "../controllers/receipt.controller";

const router = express.Router();
router.post("/generate-receipt", [sessionMiddleware, authenticateToken], ReceiptCtrl.generateReceipt);

export default router;
