import type { Request, Response } from "express";
import Joi from "joi";
import { AppError, sendServerError } from "../../utils/errors";
import { VALIDATE_ALL, sendValidationError } from "../../utils/validation";
import FacebookService from "./facebook.service";

const selectPageSchema = Joi.object({
  pageId: Joi.string().trim().pattern(/^\d+$/).max(64).required().messages({
    "string.pattern.base": "Choose one of your Facebook Pages.",
  }),
});

const shareSchema = Joi.object({
  postId: Joi.string().trim().uuid().required(),
});

/** A 409 for a share already live or in progress carries that share. */
function sendError(res: Response, err: unknown) {
  if (err instanceof AppError && "share" in err) {
    return res.status(err.status).json({
      success: false,
      message: err.message,
      code: err.code,
      data: (err as AppError & { share: unknown }).share,
    });
  }
  return sendServerError(res, err, { success: true });
}

export default class FacebookController {
  static async getConnection(req: Request, res: Response) {
    try {
      const data = await FacebookService.getConnection(req.user!.userId);
      return res.status(200).json({ success: true, data });
    } catch (err) {
      return sendError(res, err);
    }
  }

  static async getConnectUrl(req: Request, res: Response) {
    try {
      const data = await FacebookService.getConnectUrl(req.user!.userId);
      return res.status(200).json({ success: true, data });
    } catch (err) {
      return sendError(res, err);
    }
  }

  /** Meta's browser redirect. Always ends in a redirect back to the app. */
  static async callback(req: Request, res: Response) {
    const str = (v: unknown) => (typeof v === "string" ? v : undefined);
    try {
      const location = await FacebookService.handleCallback({
        code: str(req.query.code),
        state: str(req.query.state),
        error: str(req.query.error),
      });
      return res.redirect(302, location);
    } catch (err) {
      console.error("[facebook] callback failed", {
        message: (err as Error)?.message,
      });
      return res.redirect(302, FacebookService.callbackFailedUrl());
    }
  }

  static async listPages(req: Request, res: Response) {
    try {
      const data = await FacebookService.listPages(req.user!.userId);
      return res.status(200).json({ success: true, data });
    } catch (err) {
      return sendError(res, err);
    }
  }

  static async selectPage(req: Request, res: Response) {
    const { error, value } = selectPageSchema.validate(req.body, VALIDATE_ALL);
    if (error) return sendValidationError(res, error, { success: true });
    try {
      const data = await FacebookService.selectPage(
        req.user!.userId,
        value.pageId,
      );
      return res.status(200).json({ success: true, data });
    } catch (err) {
      return sendError(res, err);
    }
  }

  static async disconnect(req: Request, res: Response) {
    try {
      const data = await FacebookService.disconnect(req.user!.userId);
      return res.status(200).json({ success: true, data });
    } catch (err) {
      return sendError(res, err);
    }
  }

  static async share(req: Request, res: Response) {
    const { error, value } = shareSchema.validate(req.body, VALIDATE_ALL);
    if (error) return sendValidationError(res, error, { success: true });
    try {
      const data = await FacebookService.share(req.user!.userId, value.postId);
      return res.status(200).json({ success: true, data });
    } catch (err) {
      return sendError(res, err);
    }
  }

  static async getShare(req: Request, res: Response) {
    const { error, value } = shareSchema.validate(
      { postId: req.params.postId },
      VALIDATE_ALL,
    );
    if (error) return sendValidationError(res, error, { success: true });
    try {
      const data = await FacebookService.getShare(
        req.user!.userId,
        value.postId,
      );
      return res.status(200).json({ success: true, data });
    } catch (err) {
      return sendError(res, err);
    }
  }
}
