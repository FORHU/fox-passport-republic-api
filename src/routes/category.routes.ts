import express from "express";
import CategoryCtrl from "../controllers/category.controller";
import { authenticate, requireAdmin } from "../middleware/auth.middleware";

const router = express.Router();

// Category CRUD routes
router.get("/", CategoryCtrl.getAllCategories);
router.get("/top-level", CategoryCtrl.getTopLevelCategories);
router.get("/:id", CategoryCtrl.getCategoryById);
router.get("/slug/:slug", CategoryCtrl.getCategoryBySlug);
router.post("/create", authenticate, requireAdmin, CategoryCtrl.createCategory);
router.put("/:id", authenticate, requireAdmin, CategoryCtrl.updateCategory);
router.delete("/:id", authenticate, requireAdmin, CategoryCtrl.deleteCategory);

export default router;
