import express from "express";
const router = express.Router();

import AdminCtrl from "../controllers/admin.controller";
import SubcriptionCtrl from "../controllers/subscription.controller";
import authenticateToken from "../middleware/authenticate-token.middleware";
import sessionMiddleware from "../middleware/valid-session.middleware";

router.get("/products", [sessionMiddleware, authenticateToken], AdminCtrl.getProducts);
router.post("/", [sessionMiddleware, authenticateToken], SubcriptionCtrl.createSubscription);
router.get("/", [sessionMiddleware, authenticateToken], SubcriptionCtrl.getVenueSubscription);
router.patch("/:id", [sessionMiddleware, authenticateToken], SubcriptionCtrl.updateVenueSubscription);
router.delete("/:id", [sessionMiddleware, authenticateToken], SubcriptionCtrl.deleteVenueSubscription);

export default router;
