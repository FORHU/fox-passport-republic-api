import { Router } from "express";
import { PartnershipController } from "./partnership.controller";
import {
  authenticate,
  requirePermission,
} from "../../middleware/auth.middleware";

const router = Router();

// Reads are scoped to the viewer (proposals they sent or that target what they
// own), so they need a signed-in user. They were public, and unscoped.
router.get("/proposals", authenticate, PartnershipController.listProposals);
router.get("/proposals/:id", authenticate, PartnershipController.getProposal);

router.post(
  "/proposals",
  authenticate,
  requirePermission("partnership:propose"),
  PartnershipController.createProposal,
);

router.patch(
  "/proposals/:id/accept",
  authenticate,
  PartnershipController.acceptProposal,
);

router.patch(
  "/proposals/:id/reject",
  authenticate,
  PartnershipController.rejectProposal,
);

router.patch(
  "/proposals/:id/withdraw",
  authenticate,
  PartnershipController.withdrawProposal,
);

export default router;
