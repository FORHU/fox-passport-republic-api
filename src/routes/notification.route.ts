import express from "express";

import NotificationCtrl from "../controllers/notification.controller";
import authenticateToken from "../middleware/authenticate-token.middleware";
import sessionMiddleware from "../middleware/valid-session.middleware";

const defaultMiddleware = [sessionMiddleware, authenticateToken];

const router = express.Router();

router.get("/", [...defaultMiddleware], NotificationCtrl.getUnreadNotificationsCountEnquiries);

export default router;
