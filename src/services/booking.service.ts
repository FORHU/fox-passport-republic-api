import BookingRepo from "../repositories/booking.repository";
import BookingAttendeeRepo from "../repositories/bookingAttendee.repository";
import PaymentRepo from "../repositories/payment.repository";
import ListingRepo from "../repositories/listing.repository";
import crypto from "crypto";
import { BookingStatus, PaymentStatus, BookingType } from "@prisma/client";

export default class BookingSvc {
  // CREATE MULTIPLE BOOKINGS (Admin/Batch)
  static async createMultipleBookings(
    bookings: {
      listingId: string;
      userId: string;
      guestCount: number;
      totalAmount: number;
      specialRequests?: string;
    }[]
  ) {
    const createdBookings = [];
    // Sequential creation to ensure unique confirmation codes
    for (const bookingData of bookings) {
      createdBookings.push(await this.createBooking(bookingData));
    }
    return createdBookings;
  }

  // Helper to generate ticket code
  private static generateTicketCode(): string {
    return `TIX-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  }
  // Generate unique confirmation code
  static generateConfirmationCode(): string {
    return crypto.randomBytes(4).toString("hex").toUpperCase();
  }

  // Calculate expiry time (30 minutes from now)
  static calculateExpiryTime(): Date {
    const expiryTime = new Date();
    expiryTime.setMinutes(expiryTime.getMinutes() + 30);
    return expiryTime;
  }

  // GET ALL BOOKINGS
  static async getAllBookings(filters?: {
    userId?: string;
    listingId?: string;
    bookingStatus?: BookingStatus;
    type?: BookingType;
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

  // GET BOOKING BY CONFIRMATION CODE
  static async getBookingByConfirmationCode(confirmationCode: string) {
    const booking =
      await BookingRepo.getBookingByConfirmationCode(confirmationCode);
    if (!booking) {
      throw new Error("Booking not found");
    }
    return booking;
  }

  // ========== MULTI-STEP BOOKING METHODS ==========

  // STEP 1: CREATE DRAFT BOOKING (Listing Selection)
  static async createDraftBooking(data: {
    listingId: string;
    userId: string;
    type?: BookingType;
    foxerServiceId?: string;
    guestCount?: number;
    totalAmount?: number;
    specialRequests?: string;
  }) {
    let confirmationCode = this.generateConfirmationCode();
    while (await BookingRepo.confirmationCodeExists(confirmationCode)) {
      confirmationCode = this.generateConfirmationCode();
    }

    const booking = await BookingRepo.createBooking({
      listingId: data.listingId,
      userId: data.userId,
      confirmationCode,
      bookingStatus: BookingStatus.draft,
      type: data.type || BookingType.standard,
      foxerServiceId: data.foxerServiceId,
      guestCount: data.guestCount,
      totalAmount: data.totalAmount,
      currentStep: 1,
      expiresAt: this.calculateExpiryTime(),
    });
    return booking;
  }

  // STEP 2: UPDATE TICKETS & AMOUNT
  static async updateDraftTickets(
    draftId: string,
    userId: string,
    data: {
      guestCount: number;
      totalAmount: number;
    }
  ) {
    const booking = await BookingRepo.getBookingById(draftId);

    if (!booking) {
      throw new Error("Draft booking not found");
    }
    if (booking.userId !== userId) {
      throw new Error("Unauthorized: You can only update your own bookings");
    }
    if (booking.status !== BookingStatus.draft) {
      throw new Error("Booking is no longer in draft status");
    }

    // Check if draft has expired
    if (booking.expiresAt && booking.expiresAt < new Date()) {
      throw new Error("Draft booking has expired");
    }

    return BookingRepo.updateBooking(draftId, {
      guestCount: data.guestCount,
      totalAmount: data.totalAmount,
      currentStep: 2,
      expiresAt: this.calculateExpiryTime(), // Extend expiry
    });
  }

  // STEP 3: UPDATE CUSTOMER INFO
  static async updateDraftCustomerInfo(
    draftId: string,
    userId: string,
    data: {
      specialRequests?: string;
    }
  ) {
    const booking = await BookingRepo.getBookingById(draftId);

    if (!booking) {
      throw new Error("Draft booking not found");
    }
    if (booking.userId !== userId) {
      throw new Error("Unauthorized: You can only update your own bookings");
    }
    if (booking.status !== BookingStatus.draft) {
      throw new Error("Booking is no longer in draft status");
    }

    if (booking.expiresAt && booking.expiresAt < new Date()) {
      throw new Error("Draft booking has expired");
    }

    return BookingRepo.updateBooking(draftId, {
      specialRequests: data.specialRequests,
      currentStep: 3,
      expiresAt: this.calculateExpiryTime(),
    });
  }

  // STEP 4: CONFIRM BOOKING (Final Step)
  static async confirmDraftBooking(draftId: string, userId: string) {
    const booking = await BookingRepo.getBookingById(draftId);

    if (!booking) {
      throw new Error("Draft booking not found");
    }
    if (booking.userId !== userId) {
      throw new Error("Unauthorized: You can only confirm your own bookings");
    }
    if (booking.status !== BookingStatus.draft) {
      throw new Error("Booking is no longer in draft status");
    }

    if (booking.expiresAt && booking.expiresAt < new Date()) {
      throw new Error("Draft booking has expired");
    }

    // Validate all required fields are filled
    if (!booking.guestCount || booking.guestCount < 1) {
      throw new Error("Guest count is required");
    }
    if (!booking.totalAmount || booking.totalAmount <= 0) {
      throw new Error("Total amount is required");
    }

    // Update to pending (awaiting payment)
    return BookingRepo.updateBooking(draftId, {
      bookingStatus: BookingStatus.pending,
      currentStep: 4,
      expiresAt: null, // Remove expiry once confirmed
    });
  }

  // STEP 5: ADD ATTENDEES
  static async addBookingAttendees(
    bookingId: string,
    userId: string,
    attendees: {
      firstName: string;
      lastName: string;
      email: string;
      phone: string;
    }[]
  ) {
    const booking = await BookingRepo.getBookingById(bookingId);
    if (!booking) throw new Error("Booking not found");
    if (booking.userId !== userId) throw new Error("Unauthorized");

    const createdAttendees = [];
    for (const attendee of attendees) {
      let ticketCode = this.generateTicketCode();
      while (await BookingAttendeeRepo.ticketCodeExists(ticketCode)) {
        ticketCode = this.generateTicketCode();
      }

      createdAttendees.push(
        await BookingAttendeeRepo.createAttendee({
          bookingId,
          ...attendee,
          ticketCode,
        })
      );
    }

    return createdAttendees;
  }

  // STEP 6: PROCESS PAYMENT
  static async processBookingPayment(
    bookingId: string,
    userId: string,
    paymentData: {
      amount: number;
      currency: string;
      paymentMethod: string;
      transactionId: string;
    }
  ) {
    const booking = await BookingRepo.getBookingById(bookingId);
    if (!booking) throw new Error("Booking not found");
    if (booking.userId !== userId) throw new Error("Unauthorized");
    if (booking.status !== BookingStatus.pending) {
      throw new Error("Booking is not in pending status");
    }

    // Create payment record
    const payment = await PaymentRepo.createPayment({
      bookingId,
      amount: paymentData.amount,
      currency: paymentData.currency,
      paymentMethod: paymentData.paymentMethod,
      paymentStatus: PaymentStatus.completed,
      transactionId: paymentData.transactionId,
      gatewayResponse: JSON.stringify({ status: "success", simulated: true }),
    });

    // Update booking to confirmed
    await BookingRepo.updateBooking(bookingId, {
      bookingStatus: BookingStatus.confirmed,
    });

    return payment;
  }

  // ========== SINGLE-STEP BOOKING (Legacy) ==========

  static async createBooking(data: {
    listingId: string;
    userId: string;
    guestCount: number;
    totalAmount: number;
    bookingStatus?: BookingStatus;
    specialRequests?: string;
  }) {
    let confirmationCode = this.generateConfirmationCode();
    while (await BookingRepo.confirmationCodeExists(confirmationCode)) {
      confirmationCode = this.generateConfirmationCode();
    }

    return BookingRepo.createBooking({
      listingId: data.listingId,
      userId: data.userId,
      guestCount: data.guestCount,
      totalAmount: data.totalAmount,
      bookingStatus: data.bookingStatus || BookingStatus.pending,
      confirmationCode,
      specialRequests: data.specialRequests,
      currentStep: 4,
    });
  }

  static async updateBooking(
    id: string,
    userId: string,
    data: Partial<{
      guestCount: number;
      totalAmount: number;
      bookingStatus: BookingStatus;
      specialRequests: string;
    }>
  ) {
    const exists = await BookingRepo.bookingExists(id);
    if (!exists) throw new Error("Booking not found");
    const isOwner = await BookingRepo.isBookingOwner(id, userId);
    if (!isOwner) throw new Error("Unauthorized");

    return BookingRepo.updateBooking(id, data);
  }

  static async deleteBooking(id: string, userId: string) {
    const exists = await BookingRepo.bookingExists(id);
    if (!exists) throw new Error("Booking not found");
    const isOwner = await BookingRepo.isBookingOwner(id, userId);
    if (!isOwner) throw new Error("Unauthorized");

    return BookingRepo.deleteBooking(id);
  }

  static async getUserBookings(userId: string) {
    return BookingRepo.getUserBookings(userId);
  }

  static async getListingBookings(listingId: string, userId: string) {
    return BookingRepo.getListingBookings(listingId);
  }

  static async cleanupExpiredDrafts() {
    return BookingRepo.deleteExpiredDrafts();
  }
}
