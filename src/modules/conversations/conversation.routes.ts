import { Router } from "express";
import ConversationController from "./conversation.controller";
import { authenticate } from "../../middleware/auth.middleware";

const router = Router();

router.get("/", authenticate, ConversationController.getConversations);
router.post("/", authenticate, ConversationController.startConversation);
router.get("/:id/messages", authenticate, ConversationController.getMessages);
router.post("/:id/messages", authenticate, ConversationController.sendMessage);
router.patch("/:id/read", authenticate, ConversationController.markRead);

export default router;
