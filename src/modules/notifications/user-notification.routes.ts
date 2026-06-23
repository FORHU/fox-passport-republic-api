import {Router} from "express";
import NotificationController from "./user-notification.controller";       
 

const router = Router();

router.get("/", NotificationController.getNotifications);
router.patch("/:id/read", NotificationController.markAsRead);
router.patch("/read-all", NotificationController.markAllAsRead); 

export default router;
