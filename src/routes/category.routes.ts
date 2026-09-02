import express from "express";
import CategoryCtrl from "../controllers/category.controller";
import { authenticate, requirePermission } from "../middleware/auth.middleware";

const router = express.Router();

// Category CRUD routes
router.get("/", CategoryCtrl.getAllCategories);
router.get("/top-level", CategoryCtrl.getTopLevelCategories);
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
