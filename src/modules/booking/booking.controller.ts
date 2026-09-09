import { Request, Response } from "express";
import Joi from "joi";
import BookingSvc, { BookingError } from "./booking.service";
import RefundSvc from "../refund/refund.service";
import { totalPages } from "../../utils/pagination";

export default class BookingCtrl {
  // BOOK FROM TEMPLATE — creates an Event + Booking in one shot for a logged-in client
  static async bookFromTemplate(req: Request, res: Response) {
    try {
      const schema = Joi.object({
        templateId: Joi.string().required(),
        guestCount: Joi.number().integer().min(1).required(),
        startAt: Joi.date().iso().required(),
        endAt: Joi.date().iso().required(),
        // IDs of optional template items the client chose to exclude
        excludedAssetIds: Joi.array().items(Joi.string()).optional(),
        excludedServiceIds: Joi.array().items(Joi.string()).optional(),
        excludedVenueIds: Joi.array().items(Joi.string()).optional(),
        // NOTE: totalAmount is intentionally NOT accepted here — it is always
        // computed server-side from the template's items + hostMarkupPercent +
        // platform fee. See docs/adr/0001-host-markup-and-server-computed-event-total.md
      });

      const { error, value } = schema.validate(req.body);
      if (error) return res.status(400).json({ message: error.message });

      const result = await BookingSvc.bookFromTemplate({
        userId: req.user!.userId,
        ...value,
      });

      return res.status(201).json({ success: true, data: result });
    } catch (e: unknown) {
      if (e instanceof BookingError) {
        return res.status(e.status).json({
          success: false,
          message: e.message,
          ...(e.code ? { code: e.code } : {}),
        });
      }
      const error = e as Error;
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  // CREATE BOOKING
  static async createBooking(req: Request, res: Response) {
    try {
      const schema = Joi.object({
        eventId: Joi.string().uuid().required(),
        guestCount: Joi.number().integer().min(1).required(),
        totalAmount: Joi.number().min(0).required(),
        attendees: Joi.array()
          .items(
            Joi.object({
              firstName: Joi.string().required(),
              lastName: Joi.string().required(),
              email: Joi.string().email().optional(),
              phone: Joi.string().optional(),
            }),
          )
          .optional(),
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        return res.status(400).json({ message: error.message });
      }

      const booking = await BookingSvc.createBooking({
        userId: req.user!.userId,
        ...value,
      });

      return res.status(201).json({ success: true, data: booking });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  // CREATE DRAFT (Step 1) — supports both event-based and direct venue booking
  static async createDraftBooking(req: Request, res: Response) {
    try {
      const schema = Joi.object({
        eventId: Joi.string().uuid().optional(),
        venueId: Joi.string().optional(),
        startDate: Joi.date()
          .iso()
          .when("venueId", { is: Joi.exist(), then: Joi.required() }),
        endDate: Joi.date()
          .iso()
          .when("venueId", { is: Joi.exist(), then: Joi.required() }),
        guestCount: Joi.number().min(1).optional(),
        totalAmount: Joi.number().min(0).optional(),
        specialRequests: Joi.string().optional(),
      }).xor("venueId", "eventId");

      const { error, value } = schema.validate(req.body);
      if (error) return res.status(400).json({ message: error.message });

      const booking = await BookingSvc.createBooking({
        userId: req.user!.userId,
        ...value,
      });

      return res.status(201).json({ success: true, data: booking });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  // GET ALL BOOKINGS
  // GET AVAILABILITY — returns booked dates for a given templateId
  static async getAvailability(req: Request, res: Response) {
    try {
      const { templateId } = req.query;
      if (!templateId || typeof templateId !== "string") {
        return res
          .status(400)
          .json({ success: false, message: "templateId is required" });
      }
      const availability = await BookingSvc.getAvailability(templateId);
      return res.status(200).json({ success: true, data: availability });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  // CANCEL CHECK — eligibility + refund estimate
  static async cancelCheck(req: Request, res: Response) {
    try {
      const schema = Joi.object({
        id: Joi.string().required(),
      });
      const { error, value } = schema.validate(req.params);
      if (error) return res.status(400).json({ message: error.message });

      const result = await RefundSvc.checkEligibility(
        value.id,
        req.user!.userId,
      );
      return res.status(200).json({ success: true, data: result });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  // CANCEL — citizen cancels booking + initiates Stripe refund
  static async cancelBooking(req: Request, res: Response) {
    try {
      const schema = Joi.object({
        id: Joi.string().required(),
      });
      const { error, value } = schema.validate(req.params);
      if (error) return res.status(400).json({ message: error.message });

      const result = await BookingSvc.cancelWithRefunds(
        value.id,
        req.user!.userId,
      );
      return res.status(200).json({ success: true, data: result });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  static async getAllBookings(req: Request, res: Response) {
    try {
      const limit = Math.min(Number(req.query.limit) || 4, 20);
      const page = Math.max(Number(req.query.page) || 1, 1);
      // The query object is passed whole and the service allow-lists it. It
      // used to be spread into a Prisma `where` directly, which handed the
      // caller arbitrary filter operators on an endpoint that also had no
      // authentication.
      const { bookings, total } = await BookingSvc.getAllBookings(
        req.query as Record<string, unknown>,
        page,
        limit,
        { userId: req.user?.userId, systemRole: req.user?.systemRole },
      );
      return res.status(200).json({
        success: true,
        data: bookings,
        pagination: {
          page,
          limit,
          total,
          totalPages: totalPages(total, limit),
        },
      });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  // GET ONE
  static async getBookingById(req: Request, res: Response) {
    try {
      const booking = await BookingSvc.getBookingById(req.params.id, req.user);
      return res.status(200).json({ success: true, data: booking });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(404).json({ success: false, message: error.message });
    }
  }

  // FINALIZE GUESTS
  static async finalizeGuests(req: Request, res: Response) {
    try {
      const result = await BookingSvc.finalizeGuestList(
        req.params.id,
        req.user!.userId,
      );
      return res.status(200).json({ success: true, data: result });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  // GET UPCOMING — dashboard upcoming events
  static async getUpcomingBookings(req: Request, res: Response) {
    try {
      const bookings = await BookingSvc.getUpcomingBookings(req.user!.userId);
      return res.status(200).json({ success: true, data: bookings });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  // GET USER BOOKINGS
  static async getUserBookings(req: Request, res: Response) {
    try {
      const limit = Math.min(Number(req.query.limit) || 4, 20);
      const page = Math.max(Number(req.query.page) || 1, 1);
      const { bookings, total } = await BookingSvc.getUserBookings(
        req.params.userId,
        page,
        limit,
      );
      return res.status(200).json({
        success: true,
        data: bookings,
        pagination: {
          page,
          limit,
          total,
          totalPages: totalPages(total, limit),
        },
      });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  // CONFIRM BOOKING AFTER STRIPE PAYMENT
  static async confirmBooking(req: Request, res: Response) {
    try {
      const schema = Joi.object({
        amount: Joi.number().min(0).required(),
        method: Joi.string().required(),
        transactionId: Joi.string().required(),
      });

      const { error, value } = schema.validate(req.body);
      if (error) return res.status(400).json({ message: error.message });

      const result = await BookingSvc.confirmPayment(
        req.params.id,
        value,
        req.user!,
      );
      return res.status(200).json({ success: true, data: result });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  // PATCH STATUS — mirrors asset-booking.controller.ts:93-107
  static async updateStatus(req: Request, res: Response) {
    try {
      const schema = Joi.object({
        status: Joi.string()
          .valid(
            "pending",
            "confirmed",
            "active",
            "completed",
            "cancelled",
            "disputed",
          )
          .required(),
      });

      const { error, value } = schema.validate(req.body);
      if (error)
        return res.status(400).json({ success: false, message: error.message });

      const booking = await BookingSvc.updateStatus(
        req.params.id,
        value.status,
        req.user!.userId,
      );
      return res.status(200).json({ success: true, data: booking });
    } catch (e: unknown) {
      const err = e as Error;
      return res.status(400).json({ success: false, message: err.message });
    }
  }

  // PATCH CONFIRM ARRIVAL — mirrors asset-booking.controller.ts:119-127
  static async confirmArrival(req: Request, res: Response) {
    try {
      const booking = await BookingSvc.confirmArrival(
        req.params.id,
        req.user!.userId,
      );
      return res.status(200).json({ success: true, data: booking });
    } catch (e: unknown) {
      const err = e as Error;
      return res.status(400).json({ success: false, message: err.message });
    }
  }

  // PATCH DISPUTE — mirrors asset-booking.controller.ts:130-137
  static async dispute(req: Request, res: Response) {
    try {
      const booking = await BookingSvc.dispute(req.params.id, req.user!.userId);
      return res.status(200).json({ success: true, data: booking });
    } catch (e: unknown) {
      const err = e as Error;
      return res.status(400).json({ success: false, message: err.message });
    }
  }

  // CHECK IN BOOKING — host scans citizen's booking QR code at the event door
  static async checkInBooking(req: Request, res: Response) {
    try {
      const schema = Joi.object({ ticketCode: Joi.string().required() });
      const { error, value } = schema.validate(req.body);
      if (error) return res.status(400).json({ message: error.message });

      const result = await BookingSvc.checkInByTicketCode(
        value.ticketCode,
        req.user!.userId,
      );

      return res.status(200).json({
        success: true,
        data: result.booking,
        payoutTriggered: result.payoutTriggered,
      });
    } catch (e: unknown) {
      if (e instanceof BookingError) {
        return res
          .status(e.status)
          .json({ success: false, message: e.message });
      }
      // The settle path still signals with message text; these three are the
      // states it distinguishes.
      const msg = (e as Error).message;
      if (msg.includes("not the host"))
        return res.status(403).json({ success: false, message: msg });
      if (msg.includes("not confirmed/paid"))
        return res.status(400).json({ success: false, message: msg });
      if (msg.includes("not found"))
        return res.status(404).json({ success: false, message: msg });
      return res.status(500).json({ success: false, message: msg });
    }
  }

  // CHECK IN ATTENDEE — host scans QR code at the event
  static async checkInAttendee(req: Request, res: Response) {
    try {
      const schema = Joi.object({ ticketCode: Joi.string().required() });
      const { error, value } = schema.validate(req.body);
      if (error) return res.status(400).json({ message: error.message });

      const updated = await BookingSvc.checkInAttendeeByTicketCode(
        value.ticketCode,
        req.user!.userId,
      );

      return res.status(200).json({ success: true, data: updated });
    } catch (e: unknown) {
      if (e instanceof BookingError) {
        return res
          .status(e.status)
          .json({ success: false, message: e.message });
      }
      const error = e as Error;
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  // APPEND ATTENDEES IN BULK (PUT)
  static async appendAttendees(req: Request, res: Response) {
    try {
      const schema = Joi.object({
        attendees: Joi.array()
          .items(
            Joi.object({
              firstName: Joi.string().required(),
              lastName: Joi.string().required(),
              email: Joi.string().email().optional(),
              phone: Joi.string().optional(),
            }),
          )
          .min(1)
          .required(),
      });

      const { error, value } = schema.validate(req.body);
      if (error) return res.status(400).json({ message: error.message });

      const results = await BookingSvc.addAttendees(
        req.params.id,
        value.attendees,
        req.user!.userId,
      );

      return res.status(200).json({ success: true, data: results });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(400).json({ success: false, message: error.message });
    }
  }
}
