import express from "express";
import PromotionCtrl from "./promotion.controller";
import {
  authenticate,
  requirePermission,
} from "../../middleware/auth.middleware";

const router = express.Router();

// A Foxer's own promotions — scoped by ownership check in the service layer,
// not by the coarser `promotions:manage` admin gate. Mounted separately from
// promotion.routes.ts (/v1/admin/promotions) so the admin/self-serve
// surfaces stay distinguishable at the route table, same as
// asset.routes.ts vs. the admin queue routes.
router.get(
  "/",
  authenticate,
  requirePermission("promotions:manage-own"),
  PromotionCtrl.getAllOwn,
);
router.post(
  "/",
  authenticate,
  requirePermission("promotions:manage-own"),
  PromotionCtrl.createOwn,
);
router.put(
  "/:id",
  authenticate,
  requirePermission("promotions:manage-own"),
  PromotionCtrl.updateOwn,
);
router.delete(
  "/:id",
  authenticate,
  requirePermission("promotions:manage-own"),
  PromotionCtrl.removeOwn,
);
router.post(
  "/:id/vouchers",
  authenticate,
  requirePermission("promotions:manage-own"),
  PromotionCtrl.generateVouchersOwn,
);
router.post(
  "/:id/vouchers/import",
  authenticate,
  requirePermission("promotions:manage-own"),
  PromotionCtrl.importVouchersOwn,
);
router.get(
  "/:id/analytics",
  authenticate,
  requirePermission("promotions:manage-own"),
  PromotionCtrl.getAnalyticsOwn,
);
router.patch(
  "/vouchers/:voucherId",
  authenticate,
  requirePermission("promotions:manage-own"),
  PromotionCtrl.setVoucherActiveOwn,
);

export default router;
