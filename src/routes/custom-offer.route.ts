import express from "express";

import CustomOfferCtrl from "../controllers/custom-offer.controller";
import authenticateToken from "../middleware/authenticate-token.middleware";
import sessionMiddleware from "../middleware/valid-session.middleware";

const router = express.Router();

router.post("/", [sessionMiddleware, authenticateToken], CustomOfferCtrl.createCustomOffer);
router.get("/", [sessionMiddleware, authenticateToken], CustomOfferCtrl.getCustomOffer);
router.patch("/:id", [sessionMiddleware, authenticateToken], CustomOfferCtrl.updateCustomOffer);
router.patch("/status/:id", [sessionMiddleware, authenticateToken], CustomOfferCtrl.updateCustomOfferStatus);
router.get("/:id", [sessionMiddleware, authenticateToken], CustomOfferCtrl.getOneCustomOffer);
router.post("/request-book", [sessionMiddleware, authenticateToken], CustomOfferCtrl.requestToBook);

export default router;
