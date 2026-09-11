import { Router } from "express";
import ConversationController from "./conversation.controller";
import { authenticate } from "../../middleware/auth.middleware";

const router = Router();

router.get("/", authenticate, ConversationController.getConversations);
router.get(
  "/can-message/:userId",
  authenticate,
  ConversationController.canMessage,
);
router.post("/", authenticate, ConversationController.startConversation);
router.post("/group", authenticate, ConversationController.createGroup);
router.patch("/:id/name", authenticate, ConversationController.renameGroup);
router.patch("/:id/photo", authenticate, ConversationController.setGroupPhoto);
router.patch("/:id/mute", authenticate, ConversationController.setMuted);
router.patch("/:id/pin", authenticate, ConversationController.setPinned);
router.post(
  "/:id/participants",
  authenticate,
  ConversationController.addParticipants,
);
router.delete(
  "/:id/participants/me",
  authenticate,
  ConversationController.leaveGroup,
);
router.delete(
  "/:id/participants/:userId",
  authenticate,
  ConversationController.removeMember,
);
router.post("/:id/accept", authenticate, ConversationController.acceptRequest);
router.post(
  "/:id/decline",
  authenticate,
  ConversationController.declineRequest,
);
router.get("/:id/messages", authenticate, ConversationController.getMessages);
router.post("/:id/messages", authenticate, ConversationController.sendMessage);
router.delete(
  "/:id/messages/:messageId",
  authenticate,
  ConversationController.deleteMessage,
);
router.post(
  "/:id/messages/:messageId/reaction",
  authenticate,
  ConversationController.reactToMessage,
);
router.patch(
  "/:id/messages/:messageId",
  authenticate,
  ConversationController.editMessage,
);
router.patch("/:id/read", authenticate, ConversationController.markRead);
router.get(
  "/:id/read-receipts",
  authenticate,
  ConversationController.getReadReceipts,
);
router.delete("/:id", authenticate, ConversationController.deleteChat);

export default router;
