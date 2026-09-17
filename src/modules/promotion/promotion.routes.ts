import express from "express";
import PromotionCtrl from "./promotion.controller";
import {
  authenticate,
  requirePermission,
} from "../../middleware/auth.middleware";

const router = express.Router();

// Admin-only throughout, same shape as platform-fee-config.routes.ts.
router.get(
  "/",
  authenticate,
  requirePermission("promotions:manage"),
  PromotionCtrl.getAll,
);
router.get(
  "/:id",
  authenticate,
  requirePermission("promotions:manage"),
  PromotionCtrl.getById,
);
router.post(
  "/",
  authenticate,
  requirePermission("promotions:manage"),
  PromotionCtrl.create,
);
router.put(
  "/:id",
  authenticate,
  requirePermission("promotions:manage"),
  PromotionCtrl.update,
);
router.delete(
  "/:id",
  authenticate,
  requirePermission("promotions:manage"),
  PromotionCtrl.remove,
);
router.post(
  "/:id/vouchers",
  authenticate,
  requirePermission("promotions:manage"),
  PromotionCtrl.generateVouchers,
);
router.post(
  "/:id/vouchers/import",
  authenticate,
  requirePermission("promotions:manage"),
  PromotionCtrl.importVouchers,
);
router.get(
  "/:id/analytics",
  authenticate,
  requirePermission("promotions:manage"),
  PromotionCtrl.getAnalytics,
);
router.patch(
  "/vouchers/:voucherId",
  authenticate,
  requirePermission("promotions:manage"),
  PromotionCtrl.setVoucherActive,
);

export default router;
