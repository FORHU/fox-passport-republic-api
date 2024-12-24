import express from "express";
const router = express.Router();
import InvoiceCtrl from "../controllers/invoice.controller";
import authenticateToken from "../middleware/authenticate-token.middleware";
import sessionMiddleware from "../middleware/valid-session.middleware";

router.get("/:id", [sessionMiddleware, authenticateToken], InvoiceCtrl.getInvoice);
router.post("/generate-invoice", [sessionMiddleware, authenticateToken], InvoiceCtrl.generateInvoice);

export default router;
