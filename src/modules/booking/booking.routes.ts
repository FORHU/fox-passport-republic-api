import express from "express";
import BookingCtrl from "./booking.controller";
import AttendeeCtrl from "./attendee.controller";
import { authenticate, optionalAuth } from "../../middleware/auth.middleware";

const router = express.Router();

// ========== MULTI-STEP BOOKING ROUTES ==========
router.post("/from-template", authenticate, BookingCtrl.bookFromTemplate); // Book directly from an approved template
router.post("/draft", authenticate, BookingCtrl.createDraftBooking); // Step 1: Create draft
router.get("/venue-price-preview", authenticate, BookingCtrl.previewVenuePrice); // must be before /:id
router.get(
  "/schedule-conflicts",
  authenticate,
  BookingCtrl.getScheduleConflicts,
); // must be before /:id

// ========== MARKETPLACE (PHASE B) ROUTES ==========
// Ad-hoc item add. Remove/confirm/reject reuse the existing, centralized
// PATCH /event-transactions/:id/review endpoint (action: confirm|reject|
// cancel) — TransactionStatusSvc already authorizes each action against the
// actual actor (provider for confirm/reject, booking owner for cancel), so
// a second, booking-scoped "remove" route would just be a thinner
// duplicate of the same call.
router.post("/:id/items", authenticate, BookingCtrl.addAdHocItem);

// ========== CANCELLATION & REFUND ROUTES ==========
router.post("/:id/cancel/check", authenticate, BookingCtrl.cancelCheck);
router.post("/:id/cancel", authenticate, BookingCtrl.cancelBooking);

// ========== GUEST MANAGEMENT ROUTES ==========
router.post("/:id/finalize", authenticate, BookingCtrl.finalizeGuests);
router.post("/:bookingId/attendees", authenticate, AttendeeCtrl.addGuest);
router.put("/:id/attendees", authenticate, BookingCtrl.appendAttendees);
router.delete("/attendees/:id", authenticate, AttendeeCtrl.removeGuest);
// static routes must come before /:id dynamic routes
// Check-in is authorized per Event in BookingSvc via AppointmentAccess — the
// Event Owner, their Organizers and Check-in Helpers, and the staff of the
// Venue it is held at on the day. None of them need a global permission, so
// a route-level `booking:check-in` here shut every helper out before the real
// check could run. On validate-rbac-guards' allow-list.
router.patch("/check-in", authenticate, BookingCtrl.checkInBooking);
router.patch("/attendees/check-in", authenticate, BookingCtrl.checkInAttendee);
router.patch(
  "/attendees/:id/respond",
  optionalAuth,
  AttendeeCtrl.respondToInvite,
);

// ========== STANDARD BOOKING CRUD ROUTES ==========
router.get("/availability", BookingCtrl.getAvailability); // must be before /:id
// Bookings include the customer's name and email, so this requires a session
// and the service scopes results to what the caller is party to. It was public.
router.get("/", authenticate, BookingCtrl.getAllBookings);
router.get("/upcoming", authenticate, BookingCtrl.getUpcomingBookings); // must be before /:id
router.get("/user/:userId", authenticate, BookingCtrl.getUserBookings);
router.get("/:id", authenticate, BookingCtrl.getBookingById); // BookingSvc.getBookingForViewer decides who
router.post("/create", authenticate, BookingCtrl.createBooking);
router.post("/:id/confirm", authenticate, BookingCtrl.confirmBooking);

// ========== LIFECYCLE ROUTES (mirrors asset-booking.routes.ts / service-booking.routes.ts) ==========
router.patch("/:id/status", authenticate, BookingCtrl.updateStatus);

router.patch("/:id/confirm-arrival", authenticate, BookingCtrl.confirmArrival);

export default router;
