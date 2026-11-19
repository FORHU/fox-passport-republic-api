import { Request, Response } from "express";
import EventTransactionSvc from "./event-transaction.service";
import EventConflictSvc from "./event-conflict.service";
import EventEditSvc from "./event-edit.service";
import Joi from "joi";
import { AppError, sendServerError } from "../../utils/errors";

const KIND = Joi.string().valid("asset", "service", "venue").required();

export default class EventTransactionCtrl {
  static async listProviderItems(req: Request, res: Response) {
    try {
      const providerId = req.user?.userId;
      if (!providerId) return res.status(401).json({ message: "Unauthorized" });
      const data = await EventTransactionSvc.getProviderDashboard(providerId);
      return res.status(200).json(data);
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(500).json({ message: error.message });
    }
  }

  /**
   * GET /event-transactions/needs-attention: the Event Foxer's upcoming
   * events that lost a Supplier (declined, a blocked day, a listing taken
   * down), and which Supplier. Always about the signed-in person's own events.
   */
  static async needsAttention(req: Request, res: Response) {
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const data = await EventConflictSvc.needsAttention(userId);
      return res.status(200).json({ success: true, data });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(500).json({ message: error.message });
    }
  }

  /**
   * GET /event-transactions/event/:eventId: one of the Event Foxer's own
   * events with every Supplier on it. Anyone else's event is "not found".
   */
  static async bookedEvent(req: Request, res: Response) {
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const data = await EventConflictSvc.eventDetail(
        userId,
        req.params.eventId,
      );
      return res.status(200).json({ success: true, data });
    } catch (e: unknown) {
      if (e instanceof AppError) {
        return res.status(e.status).json({ message: e.message, code: e.code });
      }
      const error = e as Error;
      return res.status(500).json({ message: error.message });
    }
  }

  static async createTransactions(req: Request, res: Response) {
    const schema = Joi.object({
      eventId: Joi.string().required(),
      bookingId: Joi.string().required(),
    });

    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ message: error.message });

    try {
      const transactions =
        await EventTransactionSvc.createTransactionsFromTemplate(
          value.eventId,
          value.bookingId,
        );
      return res
        .status(201)
        .json({ message: "Transactions created successfully", transactions });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(400).json({ message: error.message });
    }
  }

  static async reviewItem(req: Request, res: Response) {
    // `action`, never a raw status — see TransactionStatusSvc.transition and
    // the allow-list it enforces. This is the fix for the previously-live
    // gap where any TransactionStatus enum value was accepted directly.
    const schema = Joi.object({
      type: Joi.string().valid("asset", "service", "venue").required(),
      action: Joi.string()
        .valid("confirm", "reject", "cancel", "decline")
        .required(),
      // Why a Supplier declined; a fixed set, only read for "decline".
      cause: Joi.string().valid("busy", "other").optional(),
    });

    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ message: error.message });

    try {
      const { id } = req.params;
      const actorId = req.user?.userId;
      if (!actorId) return res.status(401).json({ message: "Unauthorized" });
      const updated = await EventTransactionSvc.reviewItem(
        id,
        value.type,
        value.action,
        actorId,
        value.cause,
      );
      const done = {
        confirm: "confirmed",
        reject: "rejected",
        cancel: "cancelled",
        decline: "declined",
      }[value.action as string];
      return res
        .status(200)
        .json({ message: `Item ${done} successfully`, updated });
    } catch (e: unknown) {
      if (e instanceof AppError) {
        return res.status(e.status).json({ message: e.message, code: e.code });
      }
      const error = e as Error;
      return res.status(400).json({ message: error.message });
    }
  }

  /**
   * GET /event-transactions/:id/replacements?kind=: listings that could take
   * the place of one of the Event Foxer's lines that needs replacing (ADR 0010).
   */
  static async replacements(req: Request, res: Response) {
    const { error, value } = Joi.object({ kind: KIND }).validate(req.query, {
      allowUnknown: true,
    });
    if (error) return res.status(400).json({ message: error.message });
    try {
      const data = await EventEditSvc.replacements(
        req.user!.userId,
        value.kind,
        req.params.id as string,
      );
      return res.status(200).json({ success: true, data });
    } catch (e: unknown) {
      return sendServerError(res, e, { success: false });
    }
  }

  /** POST /event-transactions/:id/replace: the host proposes a replacement. */
  static async proposeReplacement(req: Request, res: Response) {
    const schema = Joi.object({
      kind: KIND,
      itemId: Joi.string().required(),
      note: Joi.string().max(500).allow("").optional(),
    });
    const { error, value } = schema.validate(req.body ?? {});
    if (error) return res.status(400).json({ message: error.message });
    try {
      const data = await EventEditSvc.propose(req.user!.userId, {
        kind: value.kind,
        transactionId: req.params.id as string,
        itemId: value.itemId,
        note: value.note,
      });
      return res.status(201).json({ success: true, data });
    } catch (e: unknown) {
      return sendServerError(res, e, { success: false });
    }
  }

  /** GET /event-transactions/proposals?bookingId=: for its citizen or host. */
  static async proposals(req: Request, res: Response) {
    const { error, value } = Joi.object({
      bookingId: Joi.string().required(),
    }).validate(req.query, { allowUnknown: true });
    if (error) return res.status(400).json({ message: error.message });
    try {
      const data = await EventEditSvc.forBooking(
        req.user!.userId,
        value.bookingId,
      );
      return res.status(200).json({ success: true, data });
    } catch (e: unknown) {
      return sendServerError(res, e, { success: false });
    }
  }

  /** POST /event-transactions/proposals/:id/{accept,decline,withdraw}. */
  static answerProposal(action: "accept" | "decline" | "withdraw") {
    return async (req: Request, res: Response) => {
      try {
        const userId = req.user!.userId;
        const id = req.params.id as string;
        const data =
          action === "accept"
            ? await EventEditSvc.accept(userId, id)
            : action === "decline"
              ? await EventEditSvc.decline(userId, id)
              : await EventEditSvc.withdraw(userId, id);
        return res.status(200).json({ success: true, data });
      } catch (e: unknown) {
        return sendServerError(res, e, { success: false });
      }
    };
  }
}
