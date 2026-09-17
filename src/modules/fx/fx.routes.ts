import express from "express";
import FxCtrl from "./fx.controller";

const router = express.Router();

// Public — display conversion has no auth/financial implications.
router.get("/rates", FxCtrl.getRates);

export default router;
