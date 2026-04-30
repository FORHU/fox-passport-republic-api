import express from "express";
import UsersCtrl from "../controllers/users.controller";

const router = express.Router();

// Public routes (must be before /:id)
router.get("/foxers", UsersCtrl.getFoxers);
router.get("/foxers/:id", UsersCtrl.getFoxerById);

router.get("/", UsersCtrl.getAllUsers);
router.get("/:id", UsersCtrl.getUserById);
router.post("/", UsersCtrl.createUser);
router.put("/:id", UsersCtrl.updateUserById); // ✅ UPDATE
router.delete("/:id", UsersCtrl.deleteUserById);

export default router;

