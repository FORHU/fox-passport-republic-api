import { Request, Response } from "express";
import Joi from "joi";
import { PartnershipType } from "@prisma/client";
import { PartnershipSvc } from "./partnership.service";
import { AuthenticatedUser } from "../../types/auth";
import { badRequest, sendServerError } from "../../utils/errors";

/**
 * The body of a new proposal. Validated here so a malformed request is a 400
 * with a sentence a person can act on, never a Prisma error naming the model
 * and its columns. Benefits and contribution are free text, matching their
 * `String?` columns.
 */
const PICK_TARGET = "Choose one event or one venue to propose to.";
const targetId = Joi.string().trim().messages({
  "string.base": PICK_TARGET,
  "string.empty": PICK_TARGET,
});

const createProposalSchema = Joi.object({
  targetEventId: targetId,
  targetVenueId: targetId,
  partnershipType: Joi.string()
    .valid(...Object.values(PartnershipType))
    .required()
    .messages({
      "any.only": "Choose a partnership type.",
      "any.required": "Choose a partnership type.",
      "string.base": "Choose a partnership type.",
    }),
  title: Joi.string().trim().min(1).max(150).required().messages({
    "string.base": "Give your proposal a title.",
    "string.empty": "Give your proposal a title.",
    "any.required": "Give your proposal a title.",
    "string.max": "Keep the title under 150 characters.",
  }),
  description: Joi.string().trim().min(1).max(5000).required().messages({
    "string.base": "Describe your proposal.",
    "string.empty": "Describe your proposal.",
    "any.required": "Describe your proposal.",
    "string.max": "Keep the description under 5,000 characters.",
  }),
  // The column is Decimal(12,2): at most 9,999,999,999.99.
  proposedAmount: Joi.number()
    .min(0)
    .max(9_999_999_999.99)
    .precision(2)
    .allow(null)
    .messages({
      "number.base": "Enter the amount as a number.",
      "number.min": "The amount can't be negative.",
      "number.max": "The amount can't be more than 9,999,999,999.99.",
    }),
  proposedBenefits: Joi.string().trim().allow("", null).max(2000).messages({
    "string.base": "Proposed benefits must be text.",
    "string.max": "Keep the proposed benefits under 2,000 characters.",
  }),
  proposedContribution: Joi.string().trim().allow("", null).max(2000).messages({
    "string.base": "Proposed contribution must be text.",
    "string.max": "Keep the proposed contribution under 2,000 characters.",
  }),
})
  .xor("targetEventId", "targetVenueId")
  .messages({
    "object.xor": PICK_TARGET,
    "object.missing": PICK_TARGET,
  });

export class PartnershipController {
  static async createProposal(req: Request, res: Response) {
    try {
      const user = req.user as AuthenticatedUser;
      const { error, value } = createProposalSchema.validate(req.body, {
        stripUnknown: true,
      });
      if (error) throw badRequest(error.details[0].message);

      const proposal = await PartnershipSvc.createProposal(user.userId, {
        ...value,
        proposedAmount: value.proposedAmount ?? undefined,
        proposedBenefits: value.proposedBenefits || undefined,
        proposedContribution: value.proposedContribution || undefined,
      });
      res.status(201).json({ success: true, data: proposal });
    } catch (e: unknown) {
      sendServerError(res, e, { success: true });
    }
  }

  static async getProposal(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const viewerId = (req.user as AuthenticatedUser).userId;
      const proposal = await PartnershipSvc.getProposal(id, viewerId);
      res.status(200).json({ success: true, data: proposal });
    } catch (e: unknown) {
      sendServerError(res, e, { success: true });
    }
  }

  static async listProposals(req: Request, res: Response) {
    try {
      const { partnerId, targetEventId, targetVenueId } = req.query;
      const viewerId = (req.user as AuthenticatedUser).userId;
      const proposals = await PartnershipSvc.listProposals(
        {
          partnerId: partnerId as string,
          targetEventId: targetEventId as string,
          targetVenueId: targetVenueId as string,
        },
        viewerId,
      );
      res.status(200).json({ success: true, data: proposals });
    } catch (e: unknown) {
      sendServerError(res, e, { success: true });
    }
  }

  static async acceptProposal(req: Request, res: Response) {
    try {
      const user = req.user as AuthenticatedUser;
      const { id } = req.params;
      const proposal = await PartnershipSvc.acceptProposal(id, user);
      res.status(200).json({ success: true, data: proposal });
    } catch (e: unknown) {
      sendServerError(res, e, { success: true });
    }
  }

  static async rejectProposal(req: Request, res: Response) {
    try {
      const user = req.user as AuthenticatedUser;
      const { id } = req.params;
      const proposal = await PartnershipSvc.rejectProposal(id, user);
      res.status(200).json({ success: true, data: proposal });
    } catch (e: unknown) {
      sendServerError(res, e, { success: true });
    }
  }

  static async withdrawProposal(req: Request, res: Response) {
    try {
      const user = req.user as AuthenticatedUser;
      const { id } = req.params;
      const proposal = await PartnershipSvc.withdrawProposal(id, user.userId);
      res.status(200).json({ success: true, data: proposal });
    } catch (e: unknown) {
      sendServerError(res, e, { success: true });
    }
  }
}
