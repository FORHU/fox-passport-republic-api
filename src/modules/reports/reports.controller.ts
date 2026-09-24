import { Request, Response } from "express";
import Joi from "joi";
import { ReportTargetType } from "@prisma/client";
import ReportsService from "./reports.service";

function statusForError(message: string): number {
  if (message.includes("not found")) return 404;
  return 400;
}

const resolveReportSchema = Joi.object({
  status: Joi.string().valid("dismissed", "actioned").required(),
  resolutionNote: Joi.string().trim().max(1000).allow("").optional(),
});

export default class ReportsController {
  static async getAdminReports(req: Request, res: Response) {
    const targetTypeParam = req.query.targetType;
    if (
      targetTypeParam !== undefined &&
      !Object.values(ReportTargetType).includes(
        targetTypeParam as ReportTargetType,
      )
    ) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid targetType filter" });
    }

    try {
      const result = await ReportsService.getAdminReports(
        Number(req.query.page ?? 1),
        Number(req.query.limit ?? 50),
        targetTypeParam as ReportTargetType | undefined,
      );
      return res.status(200).json({
        success: true,
        data: result.rows,
        pagination: result.pagination,
        counts: result.counts,
      });
    } catch (e: unknown) {
      const err = e as Error;
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  static async fileReport(req: Request, res: Response) {
    const schema = Joi.object({
      targetType: Joi.string()
        .valid(...Object.values(ReportTargetType))
        .required(),
      targetId: Joi.string().required(),
      reason: Joi.string().trim().min(1).max(100).required(),
      details: Joi.string().trim().max(1000).allow("").optional(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ success: false, message: error.message });
    }

    try {
      const report = await ReportsService.fileReport(req.user!, value);
      return res.status(201).json({ success: true, data: report });
    } catch (e: unknown) {
      const err = e as Error;
      return res
        .status(statusForError(err.message))
        .json({ success: false, message: err.message });
    }
  }

  static async resolveReport(req: Request, res: Response) {
    const { error, value } = resolveReportSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ success: false, message: error.message });
    }

    try {
      const report = await ReportsService.resolveReport(
        req.user!,
        req.params.id,
        value,
      );
      return res.status(200).json({ success: true, data: report });
    } catch (e: unknown) {
      const err = e as Error;
      return res
        .status(statusForError(err.message))
        .json({ success: false, message: err.message });
    }
  }
}
