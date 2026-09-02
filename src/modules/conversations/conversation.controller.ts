import { Request, Response } from "express";
import Joi from "joi";
import ConversationService from "./conversation.service";

function statusForError(message: string): number {
  if (message === "Unauthorized") return 403;
  if (message === "Conversation not found") return 404;
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
    const schema = Joi.object({ content: Joi.string().min(1).required() });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ message: error.message });

    try {
      const message = await ConversationService.sendMessage({
        conversationId: req.params.id,
        senderId: req.user!.userId,
        content: value.content,
      });
      res.json({ success: true, data: message });
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
}
