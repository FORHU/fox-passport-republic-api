import { Request, Response } from "express";
import Joi from "joi";
import {
  EventCategory,
  MatchDeclineReason,
  PackageLineKind,
} from "@prisma/client";
import PackageApplicationSvc from "./package-application.service";
import { AppError, sendAppError } from "../../utils/errors";

/** Sends a service error as its status, anything else as a 500. */
function fail(res: Response, e: unknown) {
  if (e instanceof AppError) return sendAppError(res, e);
  console.error(e);
  return res
    .status(500)
    .json({ success: false, message: "Something went wrong" });
}

/** Open packages and applications (api#460). */
export default class PackageApplicationCtrl {
  static async listOpen(req: Request, res: Response) {
    const { error, value } = Joi.object({
      category: Joi.string().valid(...Object.values(EventCategory)),
      city: Joi.string().trim().max(100).allow(""),
      page: Joi.number().integer().min(1),
      limit: Joi.number().integer().min(1).max(50),
    }).validate(req.query);
    if (error)
      return res.status(400).json({ success: false, message: error.message });
    try {
      const data = await PackageApplicationSvc.listOpen(req.user!.userId, {
        ...value,
        city: value.city || undefined,
      });
      return res.status(200).json({ success: true, data });
    } catch (e) {
      return fail(res, e);
    }
  }

  static async getOpen(req: Request, res: Response) {
    try {
      const data = await PackageApplicationSvc.getOpen(
        req.user!.userId,
        req.params.id,
      );
      return res.status(200).json({ success: true, data });
    } catch (e) {
      return fail(res, e);
    }
  }

  static async apply(req: Request, res: Response) {
    const { error, value } = Joi.object({
      kind: Joi.string()
        .valid(...Object.values(PackageLineKind))
        .required(),
      listingId: Joi.string().required(),
      message: Joi.string().trim().max(500).allow(""),
    }).validate(req.body);
    if (error)
      return res.status(400).json({ success: false, message: error.message });
    try {
      const data = await PackageApplicationSvc.apply(
        req.user!.userId,
        req.params.id,
        value,
      );
      return res.status(201).json({ success: true, data });
    } catch (e) {
      return fail(res, e);
    }
  }

  static async withdraw(req: Request, res: Response) {
    try {
      const data = await PackageApplicationSvc.withdraw(
        req.user!.userId,
        req.params.id,
        req.params.applicationId,
      );
      return res.status(200).json({ success: true, data });
    } catch (e) {
      return fail(res, e);
    }
  }

  static async listForOwner(req: Request, res: Response) {
    try {
      const data = await PackageApplicationSvc.listForOwner(
        req.user!.userId,
        req.params.id,
      );
      return res.status(200).json({ success: true, data });
    } catch (e) {
      return fail(res, e);
    }
  }

  static async answer(req: Request, res: Response) {
    const { error, value } = Joi.object({
      status: Joi.string().valid("accepted", "declined").required(),
      reason: Joi.string().valid(...Object.values(MatchDeclineReason)),
      note: Joi.string().trim().max(300).allow(""),
    }).validate(req.body);
    if (error)
      return res.status(400).json({ success: false, message: error.message });
    try {
      const data = await PackageApplicationSvc.answer(
        req.user!.userId,
        req.params.id,
        req.params.applicationId,
        value,
      );
      return res.status(200).json({ success: true, data });
    } catch (e) {
      return fail(res, e);
    }
  }
}
