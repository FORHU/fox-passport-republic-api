import { Router } from "express";
import UserController from "../controllers/user.controller";
import { authenticate } from "../middleware/auth.middleware";

const router = Router();

// User profile routes
router.get("/profile", authenticate, UserController.getProfile);

// Become host route
router.post("/become-host", authenticate, UserController.becomeHost);

export default router;
