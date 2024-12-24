import express from "express";
const router = express.Router();
import PaymentTransactionCtrl from "../controllers/payment-transaction.controller";
import authenticateToken from "../middleware/authenticate-token.middleware";
import sessionMiddleware from "../middleware/valid-session.middleware";

router.get("/", [sessionMiddleware, authenticateToken], PaymentTransactionCtrl.getTransactions);
router.post("/repeat-transfer/:id", [sessionMiddleware, authenticateToken], PaymentTransactionCtrl.repeatTransfer);

export default router;
