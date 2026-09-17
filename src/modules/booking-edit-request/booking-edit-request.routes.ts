import { Router } from "express";
import BookingEditRequestCtrl from "./booking-edit-request.controller";
import { authenticate } from "../../middleware/auth.middleware";

const router = Router();

router.get("/", authenticate, BookingEditRequestCtrl.getForBooking);
router.post("/", authenticate, BookingEditRequestCtrl.create);

router.patch("/:id/approve", authenticate, BookingEditRequestCtrl.approve);
router.patch("/:id/decline", authenticate, BookingEditRequestCtrl.decline);
router.patch("/:id/withdraw", authenticate, BookingEditRequestCtrl.withdraw);
router.post(
  "/:id/confirm-delta-payment",
  authenticate,
  BookingEditRequestCtrl.confirmDeltaPayment,
);

export default router;
