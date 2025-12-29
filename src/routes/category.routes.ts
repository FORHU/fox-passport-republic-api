import express from "express";
import CategoryCtrl from "../controllers/category.controller";

const router = express.Router();

// Category CRUD routes
router.get("/", CategoryCtrl.getAllCategories);
router.get("/top-level", CategoryCtrl.getTopLevelCategories);
router.get("/:id", CategoryCtrl.getCategoryById);
router.get("/slug/:slug", CategoryCtrl.getCategoryBySlug);
router.post("/create", CategoryCtrl.createCategory);
router.put("/:id", CategoryCtrl.updateCategory);
router.delete("/:id", CategoryCtrl.deleteCategory);

export default router;
