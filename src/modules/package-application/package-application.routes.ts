import express from "express";
import PackageApplicationCtrl from "./package-application.controller";
import {
  authenticate,
  requirePermission,
  requirePermissionAny,
} from "../../middleware/auth.middleware";

/**
 * Open packages and applications (api#460), under /v1/package-applications.
 * Seeing and applying to open packages is for Event, Venue and Provider
 * users only (never citizens); answering is the package's Event Foxer's.
 */
const router = express.Router();

router.get(
  "/open",
  authenticate,
  requirePermissionAny([
    "template:manage",
    "venue:manage",
    "asset:manage",
    "service:manage",
  ]),
  PackageApplicationCtrl.listOpen,
);
router.get(
  "/open/:id",
  authenticate,
  requirePermissionAny([
    "template:manage",
    "venue:manage",
    "asset:manage",
    "service:manage",
  ]),
  PackageApplicationCtrl.getOpen,
);

router.post(
  "/open/:id/applications",
  authenticate,
  requirePermissionAny(["venue:manage", "asset:manage", "service:manage"]),
  PackageApplicationCtrl.apply,
);
router.delete(
  "/open/:id/applications/:applicationId",
  authenticate,
  requirePermissionAny([
    "template:manage",
    "venue:manage",
    "asset:manage",
    "service:manage",
  ]),
  PackageApplicationCtrl.withdraw,
);

// The package's Event Foxer: see and answer applications (the service checks
// they own it; `template:manage` alone is every Event Foxer).
router.get(
  "/packages/:id/applications",
  authenticate,
  requirePermission("template:manage"),
  PackageApplicationCtrl.listForOwner,
);
router.patch(
  "/packages/:id/applications/:applicationId",
  authenticate,
  requirePermission("template:manage"),
  PackageApplicationCtrl.answer,
);

export default router;
