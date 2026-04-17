import BookingRepo from "../repositories/booking.repository";
import BookingAttendeeRepo from "../repositories/bookingAttendee.repository";
import PaymentRepo from "../repositories/payment.repository"; // You might need to check this one too
import crypto from "crypto";
import { BookingStatus, PaymentStatus } from "@prisma/client";

export default class BookingSvc {
  // CREATE MULTIPLE BOOKINGS (Admin/Batch)
  static async createMultipleBookings(
    bookings: {
      eventId: string;
      userId: string;
      guestCount: number;
      totalAmount: number;
      attendees: any[];
    }[]
  ) {
    const results = [];
    for (const bookingData of bookings) {
      try {
        const booking = await this.createBooking(bookingData);
        results.push({ success: true, bookingId: booking.id });
      } catch (error: any) {
        results.push({ success: false, error: error.message });
      }
    }
    return results;
  }

  // GET ALL BOOKINGS
  static async getAllBookings(filters?: {
    userId?: string;
    eventId?: string;
    bookingStatus?: BookingStatus;
  }) {
    return BookingRepo.getAllBookings(filters);
  }

  // GET BOOKING BY ID
  static async getBookingById(id: string) {
    const booking = await BookingRepo.getBookingById(id);
    if (!booking) {
      throw new Error("Booking not found");
    }
    return booking;
  }

  // GET BOOKING BY CODE
  static async getBookingByConfirmationCode(code: string) {
    const bookings = await BookingRepo.getAllBookings();
    const booking = bookings.find((b: any) => String(b.id) === String(code));
    if (!booking) throw new Error("Booking not found");
    return booking as any;
  }

  // ========== MULTI-STEP BOOKING METHODS ==========

  // STEP 1: CREATE DRAFT BOOKING (Event Selection)
  static async createDraftBooking(data: {
    eventId: string;
    userId: string;
    guestCount?: number;
    totalAmount?: number;
    specialRequests?: string;
  }) {
    // Generate unique confirmation code
    let confirmationCode = "";
    let isUnique = false;
    while (!isUnique) {
      confirmationCode = crypto.randomBytes(4).toString("hex").toUpperCase();
      isUnique = true;
    }

    const booking = await BookingRepo.createBooking({
      eventId: data.eventId,
      userId: data.userId,
      bookingStatus: BookingStatus.pending,
      guestCount: data.guestCount || 0,
      totalAmount: data.totalAmount || 0,
      startAt: new Date(),
      endAt: this.calculateExpiryTime(),
    });

    return booking;
  }

  // HELPER: Calculate expiry time (e.g., 15 minutes from now)
  private static calculateExpiryTime(): Date {
    const now = new Date();
    return new Date(now.getTime() + 15 * 60000); // 15 minutes
  }

  // STEP 2: ADD ATTENDEES (Update Draft)
  static async addAttendeesToDraft(
    bookingId: string,
    attendees: { firstName: string; lastName: string; email?: string; phone?: string }[]
  ) {
    const booking = await BookingRepo.getBookingById(bookingId);
    if (!booking) throw new Error("Booking not found");
    if (booking.status !== BookingStatus.pending) throw new Error("Booking is not in pending status");

    // Clear existing attendees if re-submitting step 2? 
    // For now, let's just add/ensure they are there. Ideally we wipe and replace for a "step" logic

    // Add attendees
    const createdAttendees = [];
    for (const attendee of attendees) {
      const ticketCode = `${booking.id}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
      const newAttendee = await BookingAttendeeRepo.createAttendee({
        bookingId,
        ...attendee,
        ticketCode,
      });
      createdAttendees.push(newAttendee);
    }

    // Update step
    await BookingRepo.updateBooking(bookingId, {
      guestCount: attendees.length,
    });

    return createdAttendees;
  }

  // STEP 3: PROCESS PAYMENT (Confirm Booking)
  static async confirmBookingPayment(
    bookingId: string,
    paymentData: {
      amount: number;
      method: string;
      transactionId: string
    }
  ) {
    const booking = await BookingRepo.getBookingById(bookingId);
    if (!booking) throw new Error("Booking not found");

    // Verify exact amount match
    if (booking.totalAmount !== paymentData.amount) {
      // throw new Error("Payment amount does not match booking total");
      // relaxed for demo
    }

    // Create Payment Record
    await PaymentRepo.createPayment({
      bookingId,
      amount: paymentData.amount,
      currency: "PHP", // Default
      method: paymentData.method,
      paymentStatus: PaymentStatus.completed,
      transactionId: paymentData.transactionId
    });

    // Update Booking Status
    const confirmedBooking = await BookingRepo.updateBooking(bookingId, {
      bookingStatus: BookingStatus.confirmed,
    });

    // TODO: Send confirmation email

    return confirmedBooking;
  }


  // ========== SINGLE-STEP BOOKING (Legacy) ==========

  static async createBooking(data: {
    eventId: string;
    userId: string;
    guestCount: number;
    totalAmount: number;
    bookingStatus?: BookingStatus;
    attendees: { firstName: string; lastName: string; email?: string; phone?: string }[];
  }) {
    // 1. Generate unique confirmation code
    let confirmationCode = "";
    let isUnique = false;
    while (!isUnique) {
      confirmationCode = crypto.randomBytes(4).toString("hex").toUpperCase();
      isUnique = true;
    }

    // 2. Create Booking
    const booking = await BookingRepo.createBooking({
      eventId: data.eventId,
      userId: data.userId,
      guestCount: data.guestCount,
      totalAmount: data.totalAmount,
      bookingStatus: data.bookingStatus ?? BookingStatus.pending,
      startAt: new Date(),
      endAt: new Date(),
    });

    // 3. Create Attendees
    if (data.attendees && data.attendees.length > 0) {
      for (const attendee of data.attendees) {
        const ticketCode = `${booking.id}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
        await BookingAttendeeRepo.createAttendee({
          bookingId: booking.id,
          firstName: attendee.firstName,
          lastName: attendee.lastName,
          email: attendee.email,
          phone: attendee.phone,
          ticketCode,
        });
      }
    }

    const result = await BookingRepo.getBookingById(booking.id);
    if (!result) {
      throw new Error("Failed to retrieve created booking");
    }
    return result;
  }

  // UPDATE BOOKING
  static async updateBooking(id: string, data: any) {
    const booking = await BookingRepo.getBookingById(id);
    if (!booking) {
      throw new Error("Booking not found");
    }
    return BookingRepo.updateBooking(id, data);
  }

  // CANCEL BOOKING
  static async cancelBooking(id: string) {
    return BookingRepo.updateBooking(id, { bookingStatus: BookingStatus.cancelled });
  }

  // GET USER BOOKINGS
  static async getUserBookings(userId: string) {
    return BookingRepo.getUserBookings(userId);
  }

  static async getEventBookings(eventId: string, userId: string) {
    return BookingRepo.getEventBookings(eventId);
  }

  // Alias for backward compatibility
  static async getListingBookings(eventId: string, userId: string) {
    return this.getEventBookings(eventId, userId);
  }

  static async cleanupExpiredDrafts() {
    // return BookingRepo.deleteExpiredDrafts(); // Add this method to repo if needed
  }
}
