import { Request, Response } from "express";
import BookingSvc from "../services/booking.service";
import Joi from "joi";
import PaymentSvc from "../services/payment.service";
import { prisma } from "../utils/prisma";
import { PaymentStatus } from "@prisma/client";
import EventTemplateSvc from "../services/event-template.service";

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

            const excludedAssetIds: string[] = value.excludedAssetIds ?? [];
            const excludedServiceIds: string[] = value.excludedServiceIds ?? [];
            const excludedVenueIds: string[] = value.excludedVenueIds ?? [];

            const template = await prisma.eventTemplate.findUnique({
                where: { id: value.templateId, isPublic: true },
                include: {
                    templateAssets: { include: { asset: { include: { owner: true } } } },
                    templateServices: { include: { service: { include: { owner: true } } } },
                    templateVenues: { include: { venue: { include: { mayor: true } } } },
                },
            });
            if (!template) return res.status(404).json({ message: "Template not found or not approved" });

            const { itemsTotal, hostMarkupAmount, platformFeeAmount, totalAmount } =
                EventTemplateSvc.calculateTotalsBreakdown(template, { excludedAssetIds, excludedServiceIds, excludedVenueIds });

            const event = await prisma.event.create({
                data: {
                    templateId: template.id,
                    clientId: req.user!.userId,
                    organizerId: template.ownerId,
                    name: template.name,
                    description: template.description ?? "",
                    eventCategory: template.category,
                    startAt: value.startAt,
                    endAt: value.endAt,
                    guestCount: value.guestCount,
                    totalAmount,
                    itemsTotal,
                    hostMarkupAmount,
                    platformFeeAmount,
                    requestStatus: "approved",
                    eventStatus: "pending",
                    targetCity: template.targetCity ?? undefined,
                    targetState: template.targetState ?? undefined,
                    targetCountry: template.targetCountry ?? undefined,
                },
            });

            const booking = await BookingSvc.createBooking({
                userId: req.user!.userId,
                eventId: event.id,
                guestCount: value.guestCount,
                totalAmount,
            });

            // Create per-partner escrow transactions for all matched template items
            const assetTxPromises = template.templateAssets
                .filter(ta => ta.assetId && ta.asset?.ownerId)
                .map(ta => prisma.eventAssetTransaction.create({
                    data: {
                        eventId: event.id,
                        bookingId: booking.id,
                        assetId: ta.assetId!,
                        providerId: ta.asset!.ownerId,
                        quantity: ta.quantity,
                        agreedPrice: ta.agreedPrice,
                        included: !excludedAssetIds.includes(ta.id),
                        status: "pending",
                    },
                }));

            const serviceTxPromises = template.templateServices
                .filter(ts => ts.serviceId && ts.service?.ownerId)
                .map(ts => prisma.eventServiceTransaction.create({
                    data: {
                        eventId: event.id,
                        bookingId: booking.id,
                        serviceId: ts.serviceId!,
                        providerId: ts.service!.ownerId,
                        agreedPrice: ts.agreedPrice,
                        included: !excludedServiceIds.includes(ts.id),
                        status: "pending",
                    },
                }));

            const venueTxPromises = template.templateVenues
                .filter(tv => tv.venueId && tv.venue?.mayorId)
                .map(tv => prisma.eventVenueTransaction.create({
                    data: {
                        eventId: event.id,
                        bookingId: booking.id,
                        venueId: tv.venueId!,
                        providerId: tv.venue!.mayorId,
                        agreedPrice: tv.agreedPrice,
                        included: !excludedVenueIds.includes(tv.id),
                        status: tv.matched ? "approved" : "pending",
                    },
                }));

            await Promise.all([...assetTxPromises, ...serviceTxPromises, ...venueTxPromises]);

            return res.status(201).json({ success: true, data: { booking, eventId: event.id } });
        } catch (error: any) {
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
                attendees: Joi.array().items(
                    Joi.object({
                        firstName: Joi.string().required(),
                        lastName: Joi.string().required(),
                        email: Joi.string().email().optional(),
                        phone: Joi.string().optional(),
                    })
                ).optional(),
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
        } catch (error: any) {
            return res.status(400).json({ success: false, message: error.message });
        }
    }

    // CREATE DRAFT (Step 1) — supports both event-based and direct venue booking
    static async createDraftBooking(req: Request, res: Response) {
        try {
            const schema = Joi.object({
                eventId: Joi.string().uuid().optional(),
                venueId: Joi.string().optional(),
                startDate: Joi.date().iso().when('venueId', { is: Joi.exist(), then: Joi.required() }),
                endDate: Joi.date().iso().when('venueId', { is: Joi.exist(), then: Joi.required() }),
                guestCount: Joi.number().min(1).optional(),
                totalAmount: Joi.number().min(0).optional(),
                specialRequests: Joi.string().optional()
            }).xor('venueId', 'eventId');

            const { error, value } = schema.validate(req.body);
            if (error) return res.status(400).json({ message: error.message });

            const booking = await BookingSvc.createBooking({
                userId: req.user!.userId,
                ...value
            });

            return res.status(201).json({ success: true, data: booking });
        } catch (error: any) {
            return res.status(500).json({ success: false, message: error.message });
        }
    }

    // GET ALL BOOKINGS
    // GET AVAILABILITY — returns booked dates for a given templateId
    static async getAvailability(req: Request, res: Response) {
        try {
            const { templateId } = req.query;
            if (!templateId || typeof templateId !== 'string') {
                return res.status(400).json({ success: false, message: 'templateId is required' });
            }
            const events = await prisma.event.findMany({
                where: { templateId },
                select: { id: true },
            });
            const bookings = await prisma.booking.findMany({
                where: {
                    eventId: { in: events.map(e => e.id) },
                    status: { notIn: ['cancelled'] },
                    startAt: { gte: new Date() },
                },
                select: { startAt: true },
            });
            const bookedDates = [...new Set(bookings.map(b => b.startAt.toISOString().split('T')[0]))];
            return res.status(200).json({ success: true, data: { bookedDates } });
        } catch (error: any) {
            return res.status(500).json({ success: false, message: error.message });
        }
    }

    static async getAllBookings(req: Request, res: Response) {
        try {
            const limit = Math.min(Number(req.query.limit) || 4, 20);
            const page = Math.max(Number(req.query.page) || 1, 1);
            const { page: _p, limit: _l, ...filters } = req.query;
            const { bookings, total } = await BookingSvc.getAllBookings(filters, page, limit);
            return res.status(200).json({
                success: true,
                data: bookings,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit),
                },
            });
        } catch (error: any) {
            return res.status(500).json({ success: false, message: error.message });
        }
    }

    // GET ONE
    static async getBookingById(req: Request, res: Response) {
        try {
            const booking = await BookingSvc.getBookingById(req.params.id, req.user);
            return res.status(200).json({ success: true, data: booking });
        } catch (error: any) {
            return res.status(404).json({ success: false, message: error.message });
        }
    }

    // FINALIZE GUESTS
    static async finalizeGuests(req: Request, res: Response) {
        try {
            const result = await BookingSvc.finalizeGuestList(req.params.id, req.user!.userId);
            return res.status(200).json({ success: true, data: result });
        } catch (error: any) {
            return res.status(400).json({ success: false, message: error.message });
        }
    }

    // GET UPCOMING — dashboard upcoming events
    static async getUpcomingBookings(req: Request, res: Response) {
        try {
            const bookings = await BookingSvc.getUpcomingBookings(req.user!.userId);
            return res.status(200).json({ success: true, data: bookings });
        } catch (error: any) {
            return res.status(500).json({ success: false, message: error.message });
        }
    }

    // GET USER BOOKINGS
    static async getUserBookings(req: Request, res: Response) {
        try {
            const limit = Math.min(Number(req.query.limit) || 4, 20);
            const page = Math.max(Number(req.query.page) || 1, 1);
            const { bookings, total } = await BookingSvc.getUserBookings(req.params.userId, page, limit);
            return res.status(200).json({
                success: true,
                data: bookings,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit),
                },
            });
        } catch (error: any) {
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

            const bookingId = req.params.id;

            // If there's an existing pending payment for this booking, update it
            // instead of creating a new one (avoids unique transactionId conflicts
            // and preserves the deposit -> full payment transition).
            const payments = await PaymentSvc.getBookingPayments(bookingId);
            const pendingPayment = payments.find(p => p.status === PaymentStatus.pending);
            const existingTransaction = payments.find(p => p.transactionId === value.transactionId);

            let payment;
            const looksLikeStripeId = String(value.transactionId).startsWith('pi_') || value.method === 'stripe';

            if (existingTransaction) {
                // If this transaction already exists for the booking, use it.
                if (existingTransaction.status !== PaymentStatus.completed) {
                    await PaymentSvc.updatePayment(existingTransaction.id, { paymentStatus: PaymentStatus.completed });
                }

                if (looksLikeStripeId) {
                    try {
                        await prisma.booking.update({ where: { id: bookingId }, data: { stripePaymentId: value.transactionId } });
                    } catch (err) {
                        console.error('Failed to set booking.stripePaymentId during confirmBooking:', err);
                    }
                }

                payment = await PaymentSvc.getPaymentById(existingTransaction.id);
            } else if (pendingPayment) {
                // mark pending payment as completed
                await PaymentSvc.updatePayment(pendingPayment.id, { paymentStatus: PaymentStatus.completed });
                // set the transaction id to the one provided by client
                await prisma.payment.update({ where: { id: pendingPayment.id }, data: { transactionId: value.transactionId, method: value.method } });
                // If this came from Stripe, link booking.stripePaymentId as well
                if (looksLikeStripeId) {
                    try {
                        await prisma.booking.update({ where: { id: bookingId }, data: { stripePaymentId: value.transactionId } });
                    } catch (err) {
                        console.error('Failed to set booking.stripePaymentId during confirmBooking:', err);
                    }
                }

                // Re-fetch payment so the included booking reflects the updated stripePaymentId
                payment = await PaymentSvc.getPaymentById(pendingPayment.id);
            } else {
                // No pending payment found — create a fresh completed payment record
                payment = await PaymentSvc.createPayment({
                    bookingId,
                    amount: value.amount,
                    currency: "PHP",
                    method: value.method,
                    paymentType: "full",
                    paymentStatus: PaymentStatus.completed,
                    transactionId: value.transactionId,
                });

                if (looksLikeStripeId) {
                    try {
                        await prisma.booking.update({ where: { id: bookingId }, data: { stripePaymentId: value.transactionId } });
                    } catch (err) {
                        console.error('Failed to set booking.stripePaymentId during confirmBooking:', err);
                    }
                }

                // Ensure returned payment includes latest booking data
                payment = await PaymentSvc.getPaymentById(payment.id);
            }

            const booking = await BookingSvc.getBookingById(bookingId, req.user);

            return res.status(200).json({ success: true, data: { booking, payment } });
        } catch (error: any) {
            return res.status(400).json({ success: false, message: error.message });
        }
    }

    // PATCH STATUS — mirrors asset-booking.controller.ts:93-107
    static async updateStatus(req: Request, res: Response) {
        try {
            const schema = Joi.object({
                status: Joi.string().valid("pending", "confirmed", "active", "completed", "cancelled", "disputed").required(),
            });

            const { error, value } = schema.validate(req.body);
            if (error) return res.status(400).json({ success: false, message: error.message });

            const booking = await BookingSvc.updateStatus(req.params.id, value.status, req.user!.userId);
            return res.status(200).json({ success: true, data: booking });
        } catch (err: any) {
            return res.status(400).json({ success: false, message: err.message });
        }
    }

    // PATCH CANCEL — dedicated cancel endpoint
    static async cancelBooking(req: Request, res: Response) {
        try {
            const booking = await BookingSvc.cancelBooking(req.params.id, req.user!.userId);
            return res.status(200).json({ success: true, data: booking });
        } catch (err: any) {
            return res.status(400).json({ success: false, message: err.message });
        }
    }

    // PATCH CONFIRM ARRIVAL — mirrors asset-booking.controller.ts:119-127
    static async confirmArrival(req: Request, res: Response) {
        try {
            const booking = await BookingSvc.confirmArrival(req.params.id, req.user!.userId);
            return res.status(200).json({ success: true, data: booking });
        } catch (err: any) {
            return res.status(400).json({ success: false, message: err.message });
        }
    }

    // PATCH DISPUTE — mirrors asset-booking.controller.ts:130-137
    static async dispute(req: Request, res: Response) {
        try {
            const booking = await BookingSvc.dispute(req.params.id, req.user!.userId);
            return res.status(200).json({ success: true, data: booking });
        } catch (err: any) {
            return res.status(400).json({ success: false, message: err.message });
        }
    }

    // APPEND ATTENDEES IN BULK (PUT)
    static async appendAttendees(req: Request, res: Response) {
        try {
            const schema = Joi.object({
                attendees: Joi.array().items(
                    Joi.object({
                        firstName: Joi.string().required(),
                        lastName: Joi.string().required(),
                        email: Joi.string().email().optional(),
                        phone: Joi.string().optional(),
                    })
                ).min(1).required(),
            });

            const { error, value } = schema.validate(req.body);
            if (error) return res.status(400).json({ message: error.message });

            const bookingId = req.params.id;
            const results = [];
            for (const attendee of value.attendees) {
                const added = await BookingSvc.addAttendee(bookingId, attendee, req.user!.userId);
                results.push(added);
            }

            return res.status(200).json({ success: true, data: results });
        } catch (error: any) {
            return res.status(400).json({ success: false, message: error.message });
        }
    }
}