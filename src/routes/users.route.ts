import express from "express";
import UsersCtrl from "../controllers/users.controller";

const router = express.Router();

router.get("/", UsersCtrl.getAllUsers);
router.get("/:id", UsersCtrl.getUserById);
router.post("/", UsersCtrl.createUser);
router.put("/:id", UsersCtrl.updateUserById);
router.delete("/:id", UsersCtrl.deleteUserById);

export default router;
