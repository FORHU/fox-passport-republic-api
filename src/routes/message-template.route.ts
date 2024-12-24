import express from "express";
import sessionMiddleware from "../middleware/valid-session.middleware";
import authenticateToken from "../middleware/authenticate-token.middleware";
import MessageTemplateCtrl from "../controllers/message-template.controller";

const router = express.Router();

router.post("/", [sessionMiddleware, authenticateToken], MessageTemplateCtrl.createMessageTemplate);
router.get("/", [sessionMiddleware, authenticateToken], MessageTemplateCtrl.getMessageTemplate);
router.patch("/:id", [sessionMiddleware, authenticateToken], MessageTemplateCtrl.updateMessageTemplate);
router.delete("/:id", [sessionMiddleware, authenticateToken], MessageTemplateCtrl.deleteMessageTemplate);

export default router;
