import { Router } from 'express';
import { PartnershipController } from './partnership.controller';
import { authenticate, requireRole } from '../../middleware/auth.middleware';

const router = Router();

router.get('/proposals', PartnershipController.listProposals);
router.get('/proposals/:id', PartnershipController.getProposal);

router.post(
  '/proposals',
  authenticate,
  requireRole(['investor']),
  PartnershipController.createProposal
);

router.patch(
  '/proposals/:id/accept',
  authenticate,
  PartnershipController.acceptProposal
);

router.patch(
  '/proposals/:id/reject',
  authenticate,
  PartnershipController.rejectProposal
);

router.patch(
  '/proposals/:id/withdraw',
  authenticate,
  PartnershipController.withdrawProposal
);

export default router;
