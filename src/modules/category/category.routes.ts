import express from "express";
import CategoryCtrl from "./category.controller";
import SpecialtySuggestionCtrl from "./specialty-suggestion.controller";
import {
  authenticate,
  requirePermission,
} from "../../middleware/auth.middleware";

const router = express.Router();

// Category CRUD routes
router.get("/", CategoryCtrl.getAllCategories);
router.get("/top-level", CategoryCtrl.getTopLevelCategories);
// Before "/:id", which would otherwise take "provider-specialties" as an id.
router.get("/provider-specialties", CategoryCtrl.getProviderSpecialties);
// The main categories (api#503), for placing an approved suggestion.
router.get("/provider-groups", CategoryCtrl.getProviderGroups);
// Specialty suggestions (api#440). Anyone signed in may ask; only catalog
// managers see the queue and decide.
router.post(
  "/provider-specialties/suggestions",
  authenticate,
  SpecialtySuggestionCtrl.suggest,
);
router.get(
  "/provider-specialties/suggestions",
  authenticate,
  requirePermission("categories:manage"),
  SpecialtySuggestionCtrl.list,
);
router.post(
  "/provider-specialties/suggestions/:id/approve",
  authenticate,
  requirePermission("categories:manage"),
  SpecialtySuggestionCtrl.approve,
);
router.post(
  "/provider-specialties/suggestions/:id/reject",
  authenticate,
  requirePermission("categories:manage"),
  SpecialtySuggestionCtrl.reject,
);
router.get("/:id", CategoryCtrl.getCategoryById);
router.get("/slug/:slug", CategoryCtrl.getCategoryBySlug);
router.post(
  "/create",
  authenticate,
  requirePermission("categories:manage"),
  CategoryCtrl.createCategory,
);
router.put(
  "/:id",
  authenticate,
  requirePermission("categories:manage"),
  CategoryCtrl.updateCategory,
);
router.delete(
  "/:id",
  authenticate,
  requirePermission("categories:manage"),
  CategoryCtrl.deleteCategory,
);

export default router;
