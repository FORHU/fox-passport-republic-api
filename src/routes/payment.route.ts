import express from "express";

import PaymentCtl from "../controllers/payment.controller";
import authenticateToken from "../middleware/authenticate-token.middleware";
import tenantMiddleware from "../middleware/tenant.middleware";
import sessionMiddleware from "../middleware/valid-session.middleware";

const router = express.Router();

router.post("/process-payment", [sessionMiddleware, authenticateToken, tenantMiddleware], PaymentCtl.processPayment);
router.post("/process-payment/status", [sessionMiddleware, authenticateToken, tenantMiddleware], PaymentCtl.processPaymentStatus);
router.post("/compute", PaymentCtl.computePayment);
router.post("/create-account", [sessionMiddleware, authenticateToken, tenantMiddleware], PaymentCtl.createAccount);
router.get("/setup-intent", [sessionMiddleware, authenticateToken, tenantMiddleware], PaymentCtl.setupPaymentIntent);
router.get("/get-payment-details", [sessionMiddleware, authenticateToken, tenantMiddleware], PaymentCtl.getPaymentDetails);
router.get("/create-login", [sessionMiddleware, authenticateToken, tenantMiddleware], PaymentCtl.createLoginLink);
router.post("/webhook/account-connect", PaymentCtl.handleAccountConnectWebhooks);
router.post("/webhook/account", PaymentCtl.handleAccountWebhooks);

export default router;
