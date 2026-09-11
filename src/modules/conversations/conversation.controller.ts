import { Request, Response } from "express";
import Joi from "joi";
import ConversationService from "./conversation.service";

function statusForError(message: string): number {
  if (message === "Unauthorized") return 403;
  if (message === "Only the group creator can remove members") return 403;
  if (message === "Conversation not found") return 404;
  if (message === "Message not found") return 404;
  if (message.startsWith("No pending message request")) return 404;
  return 400;
}

export default class ConversationController {
  static async getConversations(req: Request, res: Response) {
    try {
      const conversations = await ConversationService.getConversationsForUser(
        req.user!.userId,
      );
      res.json({ success: true, data: conversations });
    } catch (e: unknown) {
      const error = e as Error;
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async canMessage(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const { userId: otherId } = req.params;
      const canMessage = await ConversationService.canMessage(userId, otherId);
      res.json({ success: true, data: { canMessage } });
    } catch (e: unknown) {
      const err = e as Error;
      res.status(400).json({ success: false, message: err.message });
    }
  }

  static async startConversation(req: Request, res: Response) {
    const schema = Joi.object({
      otherUserId: Joi.string().required(),
      contextType: Joi.string().optional(),
      contextId: Joi.string().optional(),
      contextLabel: Joi.string().optional(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ message: error.message });

    try {
      const conversation = await ConversationService.startConversation({
        requesterId: req.user!.userId,
        otherUserId: value.otherUserId,
        contextType: value.contextType,
        contextId: value.contextId,
        contextLabel: value.contextLabel,
      });
      res.json({ success: true, data: conversation });
    } catch (e: unknown) {
      const err = e as Error;
      res
        .status(statusForError(err.message))
        .json({ success: false, message: err.message });
    }
  }

  static async acceptRequest(req: Request, res: Response) {
    try {
      const result = await ConversationService.acceptRequest(
        req.params.id,
        req.user!.userId,
      );
      res.json({ success: true, data: result });
    } catch (e: unknown) {
      const err = e as Error;
      res
        .status(statusForError(err.message))
        .json({ success: false, message: err.message });
    }
  }

  static async declineRequest(req: Request, res: Response) {
    try {
      const result = await ConversationService.declineRequest(
        req.params.id,
        req.user!.userId,
      );
      res.json({ success: true, data: result });
    } catch (e: unknown) {
      const err = e as Error;
      res
        .status(statusForError(err.message))
        .json({ success: false, message: err.message });
    }
  }

  static async getMessages(req: Request, res: Response) {
    try {
      const before = req.query.before
        ? new Date(req.query.before as string)
        : undefined;
      const messages = await ConversationService.getMessages(
        req.params.id,
        req.user!.userId,
        { limit: Number(req.query.limit) || undefined, before },
      );
      res.json({ success: true, data: messages });
    } catch (e: unknown) {
      const err = e as Error;
      res
        .status(statusForError(err.message))
        .json({ success: false, message: err.message });
    }
  }

  static async sendMessage(req: Request, res: Response) {
    const schema = Joi.object({
      content: Joi.string().allow("").optional(),
      sharedPostId: Joi.string().optional(),
      attachmentUrls: Joi.array().items(Joi.string()).max(10).optional(),
      replyToId: Joi.string().optional(),
      isForwarded: Joi.boolean().optional(),
    }).or("content", "sharedPostId", "attachmentUrls");
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ message: error.message });

    try {
      const message = await ConversationService.sendMessage({
        conversationId: req.params.id,
        senderId: req.user!.userId,
        content: value.content ?? "",
        sharedPostId: value.sharedPostId,
        attachmentUrls: value.attachmentUrls,
        replyToId: value.replyToId,
        isForwarded: value.isForwarded,
      });
      res.json({ success: true, data: message });
    } catch (e: unknown) {
      const err = e as Error;
      res
        .status(statusForError(err.message))
        .json({ success: false, message: err.message });
    }
  }

  static async deleteChat(req: Request, res: Response) {
    try {
      const result = await ConversationService.deleteChatForUser(
        req.params.id,
        req.user!.userId,
      );
      res.json({ success: true, data: result });
    } catch (e: unknown) {
      const err = e as Error;
      res
        .status(statusForError(err.message))
        .json({ success: false, message: err.message });
    }
  }

  static async deleteMessage(req: Request, res: Response) {
    try {
      const result = await ConversationService.deleteMessage(
        req.params.id,
        req.params.messageId,
        req.user!.userId,
      );
      res.json({ success: true, data: result });
    } catch (e: unknown) {
      const err = e as Error;
      res
        .status(statusForError(err.message))
        .json({ success: false, message: err.message });
    }
  }

  static async editMessage(req: Request, res: Response) {
    const schema = Joi.object({
      content: Joi.string().min(1).required(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ message: error.message });

    try {
      const message = await ConversationService.editMessage(
        req.params.id,
        req.params.messageId,
        req.user!.userId,
        value.content,
      );
      res.json({ success: true, data: message });
    } catch (e: unknown) {
      const err = e as Error;
      res
        .status(statusForError(err.message))
        .json({ success: false, message: err.message });
    }
  }

  static async reactToMessage(req: Request, res: Response) {
    const schema = Joi.object({
      emoji: Joi.string().max(8).allow(null).required(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ message: error.message });

    try {
      const result = await ConversationService.reactToMessage(
        req.params.id,
        req.params.messageId,
        req.user!.userId,
        value.emoji,
      );
      res.json({ success: true, data: result });
    } catch (e: unknown) {
      const err = e as Error;
      res
        .status(statusForError(err.message))
        .json({ success: false, message: err.message });
    }
  }

  static async markRead(req: Request, res: Response) {
    try {
      await ConversationService.markRead(req.params.id, req.user!.userId);
      res.json({ success: true });
    } catch (e: unknown) {
      const err = e as Error;
      res
        .status(statusForError(err.message))
        .json({ success: false, message: err.message });
    }
  }

  static async getReadReceipts(req: Request, res: Response) {
    try {
      const receipts = await ConversationService.getReadReceipts(
        req.params.id,
        req.user!.userId,
      );
      res.json({ success: true, data: receipts });
    } catch (e: unknown) {
      const err = e as Error;
      res
        .status(statusForError(err.message))
        .json({ success: false, message: err.message });
    }
  }

  static async setGroupPhoto(req: Request, res: Response) {
    const schema = Joi.object({
      imgId: Joi.string().allow("", null).required(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ message: error.message });

    try {
      const conversation = await ConversationService.setGroupPhoto(
        req.params.id,
        req.user!.userId,
        value.imgId || null,
      );
      res.json({ success: true, data: conversation });
    } catch (e: unknown) {
      const err = e as Error;
      res
        .status(statusForError(err.message))
        .json({ success: false, message: err.message });
    }
  }

  static async createGroup(req: Request, res: Response) {
    const schema = Joi.object({
      name: Joi.string().max(100).optional(),
      participantIds: Joi.array().items(Joi.string()).min(2).required(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ message: error.message });

    try {
      const conversation = await ConversationService.createGroupConversation({
        creatorId: req.user!.userId,
        name: value.name,
        participantIds: value.participantIds,
      });
      res.json({ success: true, data: conversation });
    } catch (e: unknown) {
      const err = e as Error;
      res
        .status(statusForError(err.message))
        .json({ success: false, message: err.message });
    }
  }

  static async setMuted(req: Request, res: Response) {
    const schema = Joi.object({ muted: Joi.boolean().required() });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ message: error.message });

    try {
      const conversation = await ConversationService.setMuted(
        req.params.id,
        req.user!.userId,
        value.muted,
      );
      res.json({ success: true, data: conversation });
    } catch (e: unknown) {
      const err = e as Error;
      res
        .status(statusForError(err.message))
        .json({ success: false, message: err.message });
    }
  }

  static async setPinned(req: Request, res: Response) {
    const schema = Joi.object({ pinned: Joi.boolean().required() });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ message: error.message });

    try {
      const conversation = await ConversationService.setPinned(
        req.params.id,
        req.user!.userId,
        value.pinned,
      );
      res.json({ success: true, data: conversation });
    } catch (e: unknown) {
      const err = e as Error;
      res
        .status(statusForError(err.message))
        .json({ success: false, message: err.message });
    }
  }

  static async renameGroup(req: Request, res: Response) {
    const schema = Joi.object({
      name: Joi.string().max(100).allow("", null).required(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ message: error.message });

    try {
      const conversation = await ConversationService.renameGroup(
        req.params.id,
        req.user!.userId,
        value.name?.trim() || null,
      );
      res.json({ success: true, data: conversation });
    } catch (e: unknown) {
      const err = e as Error;
      res
        .status(statusForError(err.message))
        .json({ success: false, message: err.message });
    }
  }

  static async addParticipants(req: Request, res: Response) {
    const schema = Joi.object({
      userIds: Joi.array().items(Joi.string()).min(1).required(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ message: error.message });

    try {
      const conversation = await ConversationService.addParticipantsToGroup(
        req.params.id,
        req.user!.userId,
        value.userIds,
      );
      res.json({ success: true, data: conversation });
    } catch (e: unknown) {
      const err = e as Error;
      res
        .status(statusForError(err.message))
        .json({ success: false, message: err.message });
    }
  }

  static async leaveGroup(req: Request, res: Response) {
    try {
      const result = await ConversationService.leaveGroup(
        req.params.id,
        req.user!.userId,
      );
      res.json({ success: true, data: result });
    } catch (e: unknown) {
      const err = e as Error;
      res
        .status(statusForError(err.message))
        .json({ success: false, message: err.message });
    }
  }

  static async removeMember(req: Request, res: Response) {
    try {
      const result = await ConversationService.removeGroupMember(
        req.params.id,
        req.user!.userId,
        req.params.userId,
      );
      res.json({ success: true, data: result });
    } catch (e: unknown) {
      const err = e as Error;
      res
        .status(statusForError(err.message))
        .json({ success: false, message: err.message });
    }
  }
}
