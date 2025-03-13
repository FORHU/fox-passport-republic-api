/* eslint-disable indent */
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { Request, Response } from "express";
import { Document, ObjectId } from "mongodb";

import { IS_BOOKING_MICROSERVICES } from "../config";
import BookingSvc from "../services/booking.service";
import CancellationPolicySvc from "../services/cancellation-policy.service";
import CustomOfferSvc from "../services/custom-offer.service";
import SpaceSvc from "../services/space.service";
import UserSvc from "../services/user.service";
import {
  validateCancelBookingSchema,
  validateCreateBookingsSchema,
  validateExisitingBookingSchema,
  validateGetBookingSchema,
  validateUpdateBookingSchema,
  validateUpdateMultipleBookingsSchema,
} from "../utils/bookings/validation";
import { dateFormat } from "../utils/helpers";
import { logger } from "../utils/logger";
import { handleErrorResponse, handleResponse } from "../utils/reponse";
import EnquirySvc from "../services/enquiries.service";

dayjs.extend(utc);
dayjs.extend(timezone);

export default class BookingCtrl {
  static async createBooking(req: Request, res: Response) {
    try {
      const { space, total_guest = 0 } = req.body;

      const { error } = validateCreateBookingsSchema(req.body);
      if (error) {
        return handleErrorResponse(res, error, { code: "VALIDATION_FAILED_MISSING_FIELDS" });
      }

      const guest_capacity: any = await SpaceSvc.getSpace({ _id: new ObjectId(space) });
      if (!guest_capacity) {
        return handleErrorResponse(res, { message: "Space not found" }, { code: "SPACE_NOT_FOUND" });
      }
      const maximum_capacity = Number(guest_capacity.guest_capacity.maximum);
      if (Number(total_guest) > maximum_capacity) {
        return handleErrorResponse(res, { message: "Total guest count exceeds maximum capacity" }, { code: "TOTAL_GUEST_EXCEEDS_MAXIMUM_CAPACITY" });
      }

      const result = await BookingSvc.processBookingEventCreation(res, req.body, req?.user);
      if (!result.data) {
        return handleErrorResponse(res, { message: result.message }, { code: result.code });
      }

      const bookingsData = result.data;
      if (bookingsData.length > 0) {
        const result =
          bookingsData.length > 1 ? await BookingSvc.createMultipleBookings(bookingsData) : await BookingSvc.createBooking(bookingsData[0]);
        return handleResponse(res, result, "BOOKING_SUCCESSFUL");
      } else {
        return handleErrorResponse(
          res,
          { message: "No bookings created. Venue may be closed or bookings already exist." },
          { code: "BOOKING_NOT_CREATED" },
        );
      }
    } catch (error) {
      logger.log({
        level: "info",
        message: `[ERROR_BOOKING_FAILED]: ${JSON.stringify(error)}`,
      });
      return handleErrorResponse(res, error, {
        code: "ERROR_BOOKING_FAILED",
      });
    }
  }

  static async existingBooking(req: Request, res: Response) {
    try {
      const { error } = validateExisitingBookingSchema(req.query);
      if (error) {
        return handleErrorResponse(res, error, { code: "VALIDATION_FAILED_MISSING_FIELDS" });
      }
      const result = await BookingSvc.processExistingBooking(req.query);

      return handleResponse(res, { available: result.availabe }, result.message);
    } catch (error) {
      logger.log({
        level: "info",
        message: `[ERROR_BOOKING_FAILED_EXISTING]: ${JSON.stringify(error)}`,
      });
      return handleErrorResponse(res, error, { code: "INTERNAL_SERVER_ERROR" });
    }
  }

  static async updateBooking(req: Request, res: Response) {
    const booking_id = req.params.booking_id;
    const { error } = validateUpdateBookingSchema(req.body);
    if (error) {
      return handleErrorResponse(res, error, { code: "VALIDATION_FAILED_MISSING_FIELDS" });
    }

    try {
      const result = await BookingSvc.processBookingUpdate(new ObjectId(booking_id), req.body);
      if (result.message === "THERE_IS_ALREADY_A_BOOKING_FOR_THE_PROVIDED_DATE_RANGE") {
        return handleErrorResponse(res, { available: false }, { code: "THERE_IS_ALREADY_A_BOOKING_FOR_THE_PROVIDED_DATE_RANGE" });
      }

      return handleResponse(res, result.data, result.message);
    } catch (error) {
      logger.log({
        level: "info",
        message: `[ERROR_BOOKING_FAILED_UPDATE]: ${JSON.stringify(error)}`,
      });
      return handleErrorResponse(res, error, { code: "ERROR_BOOKING_UPDATE_FAILED" });
    }
  }

  static async updateMultipleBookings(req: Request, res: Response) {
    const {
      booking_ids,
      space,
      venue,
      booked_user,
      start_date,
      start_time = "00:00",
      end_time = "00:00",
      total_guest,
      total_price,
      event_duration,
      repeat_event,
      optional_input,
      status,
      event_type,
    } = req.body;

    const { error } = validateUpdateMultipleBookingsSchema(req.body);
    if (error) {
      return handleErrorResponse(res, error, { code: "VALIDATION_FAILED_MISSING_FIELDS" });
    }

    const date = {
      date: start_date,
      from: start_time,
      to: end_time,
    };

    const formattedDates = dateFormat(date);

    if (booking_ids.length !== formattedDates.length) {
      return handleErrorResponse(res, new Error("Mismatched booking IDs and dates"), { code: "MISMATCHED_IDS_AND_DATES" });
    }

    try {
      let totalModifiedCount = 0;
      let totalMatchedCount = 0;

      for (let i = 0; i < booking_ids.length; i++) {
        const booking_id = booking_ids[i];
        const formattedDate = formattedDates[i];
        const { start_date_time, end_date_time } = formattedDate.timestamp;

        const existingBooking = await BookingSvc.existingBooking(new ObjectId(space as string), start_date_time, end_date_time);
        if (existingBooking) {
          return handleErrorResponse(res, existingBooking, { code: "THERE_IS_ALREADY_A_BOOKING_FOR_THE_PROVIDED_DATE_RANGE" });
        }

        const updateData = {
          ...(req?.user?._id && { booker: new ObjectId(req.user._id as string) }),
          ...(booked_user && { booked_user: new ObjectId(booked_user as string) }),
          ...(space && { space: new ObjectId(space as string) }),
          ...(venue && { venue: new ObjectId(venue as string) }),
          ...(start_date_time && { start_date: start_date_time }),
          ...(end_date_time && { end_date: end_date_time }),
          ...(total_guest !== undefined && { total_guest }),
          ...(total_price !== undefined && { total_price }),
          ...(status !== undefined && { status }),
          ...(repeat_event !== undefined && { repeat_event }),
          ...(event_duration !== undefined && { event_duration }),
          ...(optional_input && { optional_input }),
          ...(event_type && { event_type }),
          booking_reference: "",
        };

        const updateResult = await BookingSvc.updateBooking(new ObjectId(booking_id as string), updateData, req?.tenant);
        totalModifiedCount += updateResult.modifiedCount;
        totalMatchedCount += updateResult.matchedCount;
      }

      return handleResponse(
        res,
        {
          acknowledged: true,
          modifiedCount: totalModifiedCount,
          upsertedId: null,
          upsertedCount: 0,
          matchedCount: totalMatchedCount,
        },
        "BOOKINGS_UPDATED",
      );
    } catch (error) {
      logger.log({
        level: "info",
        message: `[ERROR_BOOKING_FAILED_UPDATE_MULTIPLE]: ${JSON.stringify(error)}`,
      });
      return handleErrorResponse(res, error, { code: "ERROR_BOOKING_UPDATE_FAILED" });
    }
  }

  static async getBooking(req: Request, res: Response) {
    const { error } = validateGetBookingSchema(req.query);
    if (error) {
      return handleErrorResponse(res, error, { code: "VALIDATION_FAILED" });
    }
    const venues = req["venues"];
    try {
      const result = await BookingSvc.getPaginatedBookings(req.query, req.user, venues);

      return handleResponse(res, result, "BOOKING_DATA_FETCHED");
    } catch (error) {
      logger.log({
        level: "info",
        message: `[ERROR_BOOKING_FAILED_FETCH]: ${JSON.stringify(error)}`,
      });
      return handleErrorResponse(res, error, {
        code: "ERROR_BOOKING_DATA_FETCH_FAILED",
      });
    }
  }

  static async deleteBooking(req: Request, res: Response) {
    try {
      const booking_id = new ObjectId(req.params.booking_id);

      let booking: Document[];
      if (IS_BOOKING_MICROSERVICES) {
        ({ booking: booking } = await BookingSvc.fetchBookingsFromMicroservices({ booking_id: booking_id, page: 1, limit: 1 }));
      } else {
        booking = await BookingSvc.getBookings({ _id: booking_id }, 0, 1);
      }
      const [existingBooking] = booking;
      if (!existingBooking) {
        return handleErrorResponse(res, {}, { code: "BOOKING_DOES_NOT_EXIST" });
      }

      if (existingBooking.event_type === "BOOKING" && (existingBooking.status === "BOOKING_CONFIRMED" || existingBooking.status === "CONFIRMED")) {
        return handleErrorResponse(res, {}, { code: "BOOKING_CAN_NOT_BE_DELETED" });
      }

      const result = await BookingSvc.deleteBooking(booking_id, new ObjectId(req?.user?._id as string));
      return handleResponse(res, result, "BOOKING_DELETED");
    } catch (error) {
      logger.log({
        level: "info",
        message: `[ERROR_BOOKING_DELETE_FAILED]: ${JSON.stringify(error)}`,
      });
      return handleErrorResponse(res, error, { code: "ERROR_BOOKING_DELETE_FAILED" });
    }
  }

  static async cancelBooking(req: Request, res: Response) {
    const booking_id = new ObjectId(req.params.booking_id);
    const { error } = validateCancelBookingSchema(req.body);
    if (error) {
      return handleErrorResponse(res, error, { code: "VALIDATION_FAILED" });
    }

    try {
      let booking: Document[];
      if (IS_BOOKING_MICROSERVICES) {
        ({ booking: booking } = await BookingSvc.fetchBookingsFromMicroservices({ booking_id: booking_id, page: 1, limit: 1 }));
      } else {
        booking = await BookingSvc.getBookings({ _id: booking_id }, 0, 1);
      }
      const [existingBooking] = booking;

      const [cancellation_policy] = await CancellationPolicySvc.getCancellationPolicy({ venue_id: String(existingBooking.venue_id) });
      if (!cancellation_policy) {
        return handleErrorResponse(res, "CANCELLATION_POLICY_NOT_FOUND", { code: "CANCELLATION_POLICY_NOT_FOUND" });
      }
      const [existingCustomOffer]: any = await CustomOfferSvc.getCustomOffer({ "booking._id": existingBooking._id });
      if (!existingBooking) {
        return handleErrorResponse(res, "CANCELLATION_POLICY_NOT_FOUND", { code: "CANCELLATION_POLICY_NOT_FOUND" });
      }

      const [existingEnquiry] = await EnquirySvc.getEnquiries({ "inbox._id": existingCustomOffer.inbox }, 0, 1);
      if (!existingBooking) {
        return handleErrorResponse(res, "ENQUIRY_NOR_FOUND", { code: "ENQUIRY_NOR_FOUND" });
      }
      const result = await BookingSvc.processBookingCancellation(
        booking_id,
        req.body,
        req.user,
        cancellation_policy,
        existingBooking,
        existingCustomOffer,
        existingEnquiry,
        req?.tenant,
      );
      // const result = await BookingSvc.updateBooking(booking_id, updatedData);
      return handleResponse(res, { result: result.result }, result.cancellationMessage);
    } catch (error) {
      logger.log({
        level: "info",
        message: `[ERROR_BOOKING_CANCEL_FAILED: ${JSON.stringify(error)}`,
      });
      return handleErrorResponse(res, error, { code: "ERROR_BOOKING_CANCEL_FAILED" });
    }
  }

  static async refundComputation(req: Request, res: Response) {
    const booking_id = new ObjectId(req.params.booking_id);
    try {
      const user = await UserSvc.getUser({ _id: new ObjectId(req.user._id as string) });
      if (!user) {
        return handleErrorResponse(res, "USER_NOT_FOUND", { code: "USER_NOT_FOUND" });
      }
      let booking: Document[];
      if (IS_BOOKING_MICROSERVICES) {
        ({ booking: booking } = await BookingSvc.fetchBookingsFromMicroservices({ booking_id: booking_id, page: 1, limit: 1 }));
      } else {
        booking = await BookingSvc.getBookings({ _id: booking_id }, 0, 1);
      }
      const [existingBooking] = booking;
      if (!existingBooking) {
        return handleErrorResponse(res, "BOOKING_NOT_FOUND", { code: "BOOKING_NOT_FOUND" });
      }

      const [cancellation_policy] = await CancellationPolicySvc.getCancellationPolicy({ venue_id: String(existingBooking.venue_id) });
      if (!cancellation_policy) {
        return handleErrorResponse(res, "CANCELLATION_POLICY_NOT_FOUND", { code: "CANCELLATION_POLICY_NOT_FOUND" });
      }

      const [existingCustomOffer]: any = await CustomOfferSvc.getCustomOffer({ "booking._id": existingBooking._id });
      if (!existingBooking) {
        return handleErrorResponse(res, "CANCELLATION_POLICY_NOT_FOUND", { code: "CANCELLATION_POLICY_NOT_FOUND" });
      }

      const result = await BookingSvc.processRefundComputation(booking_id, user, cancellation_policy, existingBooking, existingCustomOffer);

      return handleResponse(res, result.result, result.message);
    } catch (error) {
      logger.log({
        level: "info",
        message: `[ERROR_BOOKING_REFUND_FAILED: ${JSON.stringify(error)}`,
      });
      return handleErrorResponse(res, error, { code: "ERROR_BOOKING_CANCEL_FAILED" });
    }
  }
}
