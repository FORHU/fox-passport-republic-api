import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { Response } from "express";
import { Document, ObjectId } from "mongodb";

import { IS_BOOKING_MICROSERVICES } from "../config";
import { booking_status, TBooking } from "../models/booking.model";
import { CancellationPolicy } from "../models/cancellation-policy.model";
import { enquiry_status } from "../models/enquiries.model";
import { user_role } from "../models/user.model";
import BookingRepo from "../repositories/booking.repository";
import CustomOfferRepo from "../repositories/custom-offer.repository";
import VenueRepo from "../repositories/venue.repository";
import { constructQuery, getRepeatedDates } from "../utils/bookings/helpers";
import {
  customCancellation,
  flexibleCancellation,
  standardSixtyCancellation,
  standardThirtyCancellation,
  veryFlexibleCancellation,
} from "../utils/cancellation-policy/helpers";
import { calculatePagination, convertDollarsToCents, dateFormat, hashSearch, sendTemplatedEmail } from "../utils/helpers";
import RedisUtil from "../utils/redis.util";
import { getAvailableTimeSlots, isSlotWithinAvailableSlot } from "../utils/space/logic";
import { getPaymentAccount, refundAccount } from "../utils/stripe";
import {
  handleInitCreateBooking,
  handleInitDeleteBooking,
  handleInitExistingBooking,
  handleInitExistingBookingDetails,
  handleInitGetBooking,
  handleInitUpdateBooking,
} from "../utils/v2/microservices/booking";
import EnquirySvc from "./enquiries.service";
import PaymentSvc from "./payment.service";
import PricingSvc from "./pricing.service";
import { metaDataKey, NotificationType } from "../models/notification.model";
import { pushNotification } from "../utils/firebase/firebase.admin";

type UpdateBookingOptions = {
  tenant?: any;
  customOfferId?: ObjectId;
  enquiryData?: any;
  userRole?: any;
  bookingData?: any;
};

dayjs.extend(utc);
dayjs.extend(timezone);

const PREFIX = "bookings";

export default class BookingSvc {
  static async createBooking(data: TBooking) {
    if (IS_BOOKING_MICROSERVICES) {
      return handleInitCreateBooking(data);
    }
    return BookingRepo.createBookings(data);
  }

  static createMultipleBookings(data: TBooking[]) {
    return BookingRepo.createMultipleBookings(data);
  }
  static async processBookingEventCreation(res: Response, payload: any, user: any) {
    const {
      space,
      venue,
      booked_user,
      start_date,
      start_time,
      end_time,
      total_guest = 0,
      total_price = 0,
      event_duration,
      repeat_event,
      optional_input,
      proceed_alternative_opt,
    } = payload;

    const defaultStartTime = "23:59";
    const defaultEndTime = "00:00";

    const startTime = start_time || defaultStartTime;

    let repeatDates: dayjs.Dayjs[] = [];
    repeatDates = getRepeatedDates(start_date, repeat_event, startTime);

    const bookingsData = [];

    for (const date of repeatDates) {
      const dayOfWeek = date.format("dddd").toUpperCase();
      const openingHours: any = await PricingSvc.getPrice({ space_id: new ObjectId(space) });

      let openingTime = start_time || defaultStartTime;
      let closingTime = end_time || defaultEndTime;

      let isTimeRangeAvailable = false;
      let availableOpeningHours = { from: defaultStartTime, to: defaultEndTime };
      if (openingHours.selected_pricing === "HIRE_FEE") {
        const hireFeeDetails = openingHours.hire_fee.days.find((d: any) => d.name === dayOfWeek);
        if (!hireFeeDetails) {
          continue;
        }
        isTimeRangeAvailable = !hireFeeDetails ? false : true;
        if (hireFeeDetails.full_day_start) {
          openingTime = hireFeeDetails?.full_day_start;
        } else {
          openingTime = start_time || hireFeeDetails?.slots?.start;
        }

        if (hireFeeDetails.full_day_end) {
          closingTime = hireFeeDetails?.full_day_end;
        } else {
          closingTime = end_time || hireFeeDetails?.slots?.end;
        }

        let availableSlots: any;

        if (hireFeeDetails.full_day_start && hireFeeDetails.full_day_end) {
          availableSlots = { start: hireFeeDetails?.full_day_start, end: hireFeeDetails?.full_day_end };
        } else {
          availableSlots = hireFeeDetails.slots;
        }

        const selectedSlot = { from: openingTime, to: closingTime };
        isTimeRangeAvailable = isSlotWithinAvailableSlot(availableSlots, selectedSlot);
        if (isTimeRangeAvailable) {
          availableOpeningHours = {
            from: hireFeeDetails.full_day_start || hireFeeDetails.slots.start,
            to: hireFeeDetails.full_day_end || hireFeeDetails.slots.end,
          };
        }
      } else {
        for (const price of openingHours.custom_price.prices) {
          if (price.weekdays.includes(dayOfWeek)) {
            const start = start_time ? start_time : price.time.from;
            const end = end_time ? end_time : price.time.to;
            isTimeRangeAvailable = isSlotWithinAvailableSlot({ start: price.time.from, end: price.time.to }, { from: start, to: end });
            if (isTimeRangeAvailable) {
              openingTime = start_time ? start_time : start;
              closingTime = end_time ? end_time : end;
              availableOpeningHours = { from: price.time.from, to: price.time.to };
              break;
            }
          }
        }
      }

      let start_date_time = `${date.format("YYYY-MM-DD")}T${openingTime}:00Z`;
      let end_date_time = null;

      if (dayjs(closingTime, "HH:mm").isBefore(dayjs(openingTime, "HH:mm"))) {
        end_date_time = `${date.add(1, "day").format("YYYY-MM-DD")}T${closingTime}:00Z`;
      } else {
        end_date_time = `${date.format("YYYY-MM-DD")}T${closingTime}:00Z`;
      }

      const existingBooking = await this.existingBooking(new ObjectId(space), new Date(start_date_time), new Date(end_date_time));

      const existingBoookingDetails = await this.existingBookingDetails(new ObjectId(space), new Date(start_date_time), new Date(end_date_time));

      if (repeat_event === "DOES_NOT_REPEAT") {
        if (!isTimeRangeAvailable) {
          return { data: null, message: "Date range is not available in spaces.", code: "SPACE_IS_NOT_AVAILABLE" };
        }
        if (existingBooking) {
          return { data: null, message: "Booking already exists for the provided date range.", code: "BOOKING_CONFLICT" };
        }
      } else {
        if (existingBooking && proceed_alternative_opt) {
          const availableSlots = getAvailableTimeSlots(availableOpeningHours, existingBoookingDetails, openingTime, closingTime);
          if (availableSlots.length > 0) {
            const [slot] = availableSlots;
            const availableOpeningTime = slot.from;
            const availableClosingTime = slot.to;
            start_date_time = `${date.format("YYYY-MM-DD")}T${availableOpeningTime}:00Z`;
            end_date_time = `${date.format("YYYY-MM-DD")}T${availableClosingTime}:00Z`;
          } else {
            continue;
          }
        } else if (existingBooking || !isTimeRangeAvailable) {
          continue;
        }
      }

      bookingsData.push({
        booker: new ObjectId(user._id),
        booked_user: new ObjectId(booked_user),
        space: new ObjectId(space),
        venue: new ObjectId(venue),
        start_date: new Date(start_date_time),
        end_date: new Date(end_date_time),
        total_guest,
        total_price,
        status: booking_status.CONFIRMED,
        booking_reference: "",
        enquiry: null,
        event_type: "EVENT",
        repeat_event,
        event_duration,
        optional_input,
      });
    }
    return { data: bookingsData };
  }

  static async getAllBookings(query: any) {
    return BookingRepo.getAllBookings(query);
  }

  static async getPaginatedBookings(params: any, user: any, venues: any) {
    const {
      booking_id,
      space_id,
      venue_id,
      booked_user,
      booker,
      from,
      to,
      start_date,
      status,
      page = 1,
      limit = 10,
      event_duration,
      event_type,
    } = params;

    const session = Boolean(user);

    const pageNumber = Math.max(1, parseInt(page.toString(), 10));
    const limitNumber = Math.max(1, parseInt(limit.toString(), 10));
    const offset = (pageNumber - 1) * limitNumber;

    const query = constructQuery(params, venues);

    const bookingPayload = {
      booking_id,
      space_id,
      venue_id,
      booked_user,
      booker,
      from,
      to,
      start_date,
      status,
      event_duration,
      event_type,
      page: pageNumber,
      limit: limitNumber,
    };

    const hashBookingPayload = hashSearch({ query, description: "getPaginatedBookings" });
    const cacheBookingPayload = await RedisUtil.getCache(hashBookingPayload, PREFIX);
    let list: any;

    if (!cacheBookingPayload) {
      let data: any[], totalItems: number;

      if (IS_BOOKING_MICROSERVICES) {
        const microserviceResponse = await BookingSvc.fetchBookingsFromMicroservices(bookingPayload);
        data = microserviceResponse.booking || [];
        totalItems = microserviceResponse.count || 0;
      } else {
        [totalItems, data] = await Promise.all([BookingSvc.countBookings(query), BookingSvc.getBookings(query, offset, limitNumber, session)]);
      }

      list = {
        data,
        totalItems,
        ...calculatePagination(totalItems, limitNumber, pageNumber, offset),
      };

      await RedisUtil.saveCache({ key: hashBookingPayload, data: JSON.stringify(list), prefix: PREFIX });
    } else {
      list = JSON.parse(cacheBookingPayload);
    }

    return list;
  }

  static getBookings(query: any, skip: number, limit: number, session?: boolean) {
    return BookingRepo.getBookings(query, skip, limit, session);
  }

  static fetchBookingsFromMicroservices(payload) {
    return handleInitGetBooking({ payload });
  }

  static countBookings(query: any) {
    return BookingRepo.countBookings(query);
  }
  static async processBookingUpdate(booking_id: ObjectId, payload: any) {
    const {
      space,
      venue,
      booked_user,
      start_date,
      start_time,
      end_time,
      total_guest,
      total_price,
      event_duration,
      repeat_event,
      optional_input,
      status,
    } = payload;

    const defaultStartTime = "23:59";
    const defaultEndTime = "00:00";

    let from = start_time || defaultStartTime;
    let to = end_time || defaultEndTime;

    const date = {
      date: start_date,
      from: start_time ?? "00:00",
      to: end_time ?? "23:59",
    };
    const formattedDates = dateFormat(date);

    let new_start_date = formattedDates.timestamp.start_date_time;
    let new_end_date = formattedDates.timestamp.end_date_time;
    const parsedDate = dayjs.tz(new_start_date, "YYYY-MM-DDTHH:mm:ssZ", "UTC");
    const dayOfWeek = parsedDate.format("dddd").toUpperCase();
    const openingHours: any = await PricingSvc.getPrice({ space_id: new ObjectId(space as string) });

    if (openingHours.selected_pricing === "HIRE_FEE") {
      const hireFeeDetails = openingHours.hire_fee.days.find((d: any) => d.name === dayOfWeek);
      if (!hireFeeDetails) {
        return { data: { available: false }, message: "SPACE_IS_NOT_AVAILABLE" };
      }
      from = start_time ? start_time : hireFeeDetails.slots.start;
      to = end_time ? end_time : hireFeeDetails.slots.end;
      new_start_date = `${parsedDate.format("YYYY-MM-DD")}T${from}:00Z`;
      new_end_date = `${parsedDate.format("YYYY-MM-DD")}T${to}:00Z`;
      const selectedSlot = { from, to };
      const isAvailable = isSlotWithinAvailableSlot(hireFeeDetails.slots, selectedSlot);
      if (!isAvailable) {
        return { data: { available: false }, message: "SPACE_IS_NOT_AVAILABLE" };
      }
    } else {
      let isAvailableSlot = false;
      for (const price of openingHours.custom_price.prices) {
        if (price.weekdays.includes(dayOfWeek)) {
          const start = start_time ? start_time : price.time.from;
          const end = end_time ? end_time : price.time.to;
          const start_date: any = `${parsedDate.format("YYYY-MM-DD")}T${start}:00Z`;
          const end_date: any = `${parsedDate.format("YYYY-MM-DD")}T${end}:00Z`;

          isAvailableSlot = isSlotWithinAvailableSlot({ start: price.time.from, end: price.time.to }, { from: start, to: end });
          const existingBooking = await BookingSvc.existingBooking(
            new ObjectId(space),
            new Date(start_date),
            new Date(end_date),
            new ObjectId(booking_id),
          );

          if (isAvailableSlot && !existingBooking) {
            from = start;
            to = end;
            break;
          }
        }
      }
      if (!isAvailableSlot) {
        return { data: { available: false }, message: "SPACE_IS_NOT_AVAILABLE" };
      }
    }

    new_start_date = `${parsedDate.format("YYYY-MM-DD")}T${from}:00Z`;
    new_end_date = `${parsedDate.format("YYYY-MM-DD")}T${to}:00Z`;

    const existingBooking = await BookingSvc.existingBooking(
      new ObjectId(space),
      new Date(new_start_date),
      new Date(new_end_date),
      new ObjectId(booking_id),
    );
    if (existingBooking) {
      return { message: "THERE_IS_ALREADY_A_BOOKING_FOR_THE_PROVIDED_DATE_RANGE" };
    }
    const updatedData: any = {
      space: new ObjectId(space),
      venue: new ObjectId(venue),
      booked_user: new ObjectId(booked_user),
      start_date: new_start_date,
      end_date: new_end_date,
      total_guest,
      optional_input,
      status,
    };
    if (total_price) {
      updatedData.total_price = total_price;
    }
    if (event_duration) {
      updatedData.event_duration = event_duration;
    }
    if (repeat_event) {
      updatedData.repeat_event = repeat_event;
    }

    const updateResult = await this.updateBooking(new ObjectId(booking_id), updatedData);
    return { message: "BOOKING_UPDATED", data: updateResult };
  }

  static async updateBooking(booking_id: ObjectId, updateData: any, options: UpdateBookingOptions = {}) {
    if (IS_BOOKING_MICROSERVICES) {
      return handleInitUpdateBooking(booking_id, updateData);
    }
    const { tenant, customOfferId, enquiryData, userRole } = options;
    const isVenueOrAdminRole = [user_role.VENUE_OWNER, user_role.ADMIN].includes(userRole);
    const receiverId = isVenueOrAdminRole ? enquiryData.user._id : enquiryData.venue.user._id;
    const senderUser = isVenueOrAdminRole ? enquiryData.venue.user : enquiryData.user;
    const sender_full_name = `${senderUser.first_name} ${senderUser.last_name}`;
    const senderId = senderUser._id;

    const participants = {
      senderId,
      receiverId,
      userId: String(receiverId),
    };
    const metadata = {
      [metaDataKey.BOOKING_ID]: booking_id,
      [metaDataKey.ENQUIRY_ID]: enquiryData._id,
    };

    if (updateData.status === booking_status.CONFIRMED) {
      await pushNotification(
        { title: "Booking Confirmed", body: `Check out your new confirmed booking by ${sender_full_name}.` },
        {
          type: NotificationType.BOOKING_CONFIRMED,
          customOfferId: String(customOfferId),
          enquiryId: String(enquiryData._id),
          bookingId: String(booking_id),
        },
        { notification: { sound: "default" } },
        { payload: { aps: { sound: "default" } } },
        participants,
        metadata,
      );
    }

    if (updateData.status === booking_status.CANCELLED) {
      await pushNotification(
        { title: "Booking Cancelled", body: `A booking has been cancelled by ${sender_full_name}.` },
        {
          type: NotificationType.BOOKING_CANCELLED,
          customOfferId: String(customOfferId),
          enquiryId: String(enquiryData._id),
          bookingId: String(booking_id),
        },
        { notification: { sound: "default" } },
        { payload: { aps: { sound: "default" } } },
        participants,
        metadata,
      );

      const [customOfferData] = await CustomOfferRepo.getCustomOffer({ "booking._id": booking_id });
      const [venueData]: any = await VenueRepo.getPaginatedVenues({ _id: customOfferData.venue._id }, 0, 1);
      sendTemplatedEmail({
        subject: `Booking Cancellation Notice`,
        email_data: {
          venue_owner_name: venueData?.user?.first_name || "Venue Owner",
          booking_date: customOfferData?.date?.date || "",
          space_name: customOfferData?.space?.name || "",
          client_first_name: customOfferData?.user?.first_name || "Client",
          client_last_name: customOfferData?.user?.last_name || "",
          email: venueData?.user?.email || "",
        },
        template_name: "booking-cancelled.html",
        support_email: tenant?.config?.support_email,
        email_credentials: tenant?.config?.email_credentials,
        tenant: tenant?.config?.name,
      });
    }
    return BookingRepo.updateBooking(booking_id, updateData);
  }
  static async processExistingBooking(params: any) {
    const { space, start_date, start_time, end_time, repeat_event } = params;

    let startTime = "23:59";
    if (start_time) {
      startTime = start_time as string;
    }

    let repeatDates: dayjs.Dayjs[] = [];
    repeatDates = getRepeatedDates([start_date], repeat_event, startTime);

    const defaultStartTime = "23:59";
    const defaultEndTime = "00:00";

    for (const date of repeatDates) {
      const dayOfWeek = date.format("dddd").toUpperCase();
      const openingHours: any = await PricingSvc.getPrice({ space_id: new ObjectId(space as string) });

      let start_date_time: string | undefined;
      let end_date_time: string | undefined;

      if (openingHours.selected_pricing === "HIRE_FEE") {
        const hireFeeDetails = openingHours.hire_fee.days.find((d: any) => d.name === dayOfWeek);
        if (hireFeeDetails) {
          const openingTime = start_time ? start_time : hireFeeDetails.slots.start || defaultStartTime;
          const closingTime = end_time ? end_time : hireFeeDetails.slots.end || defaultEndTime;
          start_date_time = `${date.format("YYYY-MM-DD")}T${openingTime}:00Z`;
          end_date_time = `${date.format("YYYY-MM-DD")}T${closingTime}:00Z`;
        }
      } else {
        const openingHoursForDay = openingHours.custom_price.opening_hours_preview[dayOfWeek];
        const openingTime = start_time ? start_time : openingHoursForDay?.from || defaultStartTime;
        const closingTime = end_time ? end_time : openingHoursForDay?.to || defaultEndTime;
        start_date_time = `${date.format("YYYY-MM-DD")}T${openingTime}:00Z`;
        end_date_time = `${date.format("YYYY-MM-DD")}T${closingTime}:00Z`;
      }

      if (start_date_time && end_date_time) {
        const result = await BookingSvc.existingBooking(new ObjectId(space as string), new Date(start_date_time), new Date(end_date_time));
        if (result) {
          return { availabe: false, message: "SPACE_IS_NOT_AVAILABLE" };
        } else {
          return { availabe: true, message: "SPACE_IS_AVAILABLE" };
        }
      } else {
        return { availabe: true, message: "SPACE_IS_AVAILABLE" };
      }
    }
  }
  static async existingBooking(space_id: ObjectId, start_date: Date, end_date: Date, booking_id?: ObjectId): Promise<boolean> {
    if (IS_BOOKING_MICROSERVICES) {
      return handleInitExistingBooking({
        space_id,
        start_date,
        end_date,
        booking_id,
      });
    }

    const query: any = {
      ["space._id"]: space_id,
      deletedAt: null,
      $or: [
        { start_date: { $lt: end_date, $gte: start_date } },
        { end_date: { $gt: start_date, $lte: end_date } },
        { start_date: { $lte: start_date }, end_date: { $gte: end_date } },
      ],
    };
    if (booking_id) {
      query._id = { $ne: booking_id };
    }
    const existingBookings = await BookingRepo.getBookings(query, 0, 1);
    return existingBookings.length > 0;
  }

  static async existingBookingDetails(space_id: ObjectId, start_date: Date, end_date: Date): Promise<any> {
    if (IS_BOOKING_MICROSERVICES) handleInitExistingBookingDetails({ space_id, start_date, end_date });
    const existingBookings = await BookingRepo.getBookings(
      {
        ["space._id"]: space_id,
        deletedAt: null,
        $or: [
          { start_date: { $lt: end_date, $gte: start_date } },
          { end_date: { $gt: start_date, $lte: end_date } },
          { start_date: { $lte: start_date }, end_date: { $gte: end_date } },
        ],
      },
      0,
      1,
    );

    return existingBookings;
  }

  static async deleteBooking(booking_id: ObjectId, deletedBy: ObjectId) {
    if (IS_BOOKING_MICROSERVICES) {
      return handleInitDeleteBooking(booking_id, deletedBy);
    }
    return BookingRepo.deleteBooking(booking_id, deletedBy);
  }

  static async processBookingCancellation(
    booking_id: ObjectId,
    payload: any,
    user: any,
    cancellation_policy: any,
    existingBooking: any,
    existingCustomOffer: any,
    existingEnquiry: any,
    tenant?: any,
  ) {
    const { reason_for_cancellation, message } = payload;
    const user_id = new ObjectId(user._id as string);
    const userRole = user.role;

    const booked_dates = {
      start_date: existingBooking.start_date,
      end_date: existingBooking.end_date,
    };
    let valid_for_cancellation: any = null;
    if (cancellation_policy.policy.no_cancellation || cancellation_policy.policy.cancellation_range === CancellationPolicy.OTHER) {
      valid_for_cancellation = {
        message: "Venue owner chose no cancellation policy for the venue.",
      };
    } else {
      switch (cancellation_policy.policy.cancellation_range) {
        case CancellationPolicy.VERY_FLEXIBLE:
          valid_for_cancellation = veryFlexibleCancellation(booked_dates);
          break;
        case CancellationPolicy.FLEXIBLE:
          valid_for_cancellation = flexibleCancellation(booked_dates);
          break;
        case CancellationPolicy.STANDARD_30:
          valid_for_cancellation = standardThirtyCancellation(booked_dates);
          break;
        case CancellationPolicy.STANDARD_60:
          valid_for_cancellation = standardSixtyCancellation(booked_dates);
          break;
        case CancellationPolicy.CUSTOM:
          valid_for_cancellation = customCancellation(booked_dates, cancellation_policy);
          break;
      }
    }

    await EnquirySvc.updateEnquiry(
      { _id: existingCustomOffer.enquiry._id },
      {
        status: enquiry_status.CANCELLED,
        updatedAt: new Date(),
        cancelledAt: new Date(),
        cancelledBy: user_id,
      },
      tenant,
    );

    let refundData: any = null;
    let cancellationMessage: string;
    let refundAmount: number = 0;
    if (
      [user_role.VENUE_OWNER, user_role.VENUE_LISTER].includes(userRole) ||
      (valid_for_cancellation?.allowed && valid_for_cancellation?.amount > 0)
    ) {
      const paymentQuery = {
        custom_offer: existingCustomOffer._id,
      };
      const payment: any = await PaymentSvc.getPayment(paymentQuery);

      if ([user_role.VENUE_OWNER, user_role.VENUE_LISTER].includes(userRole)) {
        refundAmount = parseFloat(payment?.payment_amount);
        cancellationMessage = "The venue owner canceled, full refund applies.";
      } else {
        refundAmount = parseFloat(payment?.payment_amount) * parseFloat(valid_for_cancellation?.amount);
        cancellationMessage = valid_for_cancellation?.message;
      }

      const paymentIntent: any = await getPaymentAccount(payment.payment_id);
      const refundPayment: any = await refundAccount(paymentIntent?.latest_charge, convertDollarsToCents(refundAmount));
      if (refundPayment) {
        await PaymentSvc.updatePayment(paymentQuery, { status: "REFUNDED", refund_id: refundPayment?.id });
      }

      const isFullRefund = [user_role.VENUE_OWNER, user_role.VENUE_LISTER].includes(userRole);

      refundData = {
        percentage: isFullRefund ? 1 : valid_for_cancellation?.amount,
        allowed: valid_for_cancellation?.allowed,
        grand_total: payment.payment_amount,
        currency: payment.payment_currency,
        refund_amount: refundAmount,
      };
    }

    const updatedData = {
      status: enquiry_status.CANCELLED,
      cancellation_reason: reason_for_cancellation,
      cancellation_message: message,
      cancelledAt: new Date(),
      cancelledBy: user,
      refund_data: refundData,
    };

    const result = await BookingSvc.updateBooking(booking_id, updatedData, {
      enquiryData: existingEnquiry,
      userRole,
      customOfferId: existingCustomOffer._id,
    });
    return { result, cancellationMessage };
  }

  static async processRefundComputation(booking_id: ObjectId, user: any, cancellation_policy: any, existingBooking: any, existingCustomOffer: any) {
    const userRole = user.role;
    let booking: Document[];
    if (IS_BOOKING_MICROSERVICES) {
      ({ booking: booking } = await BookingSvc.fetchBookingsFromMicroservices({ booking_id: booking_id, page: 1, limit: 1 }));
    } else {
      booking = await BookingSvc.getBookings({ _id: booking_id }, 0, 1);
    }

    const booked_dates = {
      start_date: existingBooking.start_date,
      end_date: existingBooking.end_date,
    };

    let valid_for_cancellation: any = null;

    if (cancellation_policy.policy.no_cancellation && cancellation_policy.policy.cancellation_range === CancellationPolicy.OTHER) {
      valid_for_cancellation = {
        message: "Venue owner chose no cancellation policy for the venue.",
      };
    } else {
      switch (cancellation_policy.policy.cancellation_range) {
        case CancellationPolicy.VERY_FLEXIBLE:
          valid_for_cancellation = veryFlexibleCancellation(booked_dates);
          break;
        case CancellationPolicy.FLEXIBLE:
          valid_for_cancellation = flexibleCancellation(booked_dates);
          break;
        case CancellationPolicy.STANDARD_30:
          valid_for_cancellation = standardThirtyCancellation(booked_dates);
          break;
        case CancellationPolicy.STANDARD_60:
          valid_for_cancellation = standardSixtyCancellation(booked_dates);
          break;
        case CancellationPolicy.CUSTOM:
          valid_for_cancellation = customCancellation(booked_dates, cancellation_policy);
          break;
      }
    }

    const paymentQuery = {
      custom_offer: existingCustomOffer._id,
    };

    const payment: any = await PaymentSvc.getPayment(paymentQuery);

    let refundAmount: number = 0;
    let refundPercentage: number = 0;
    let message;
    if ([user_role.VENUE_OWNER, user_role.VENUE_LISTER].includes(userRole)) {
      refundPercentage = 1;
      refundAmount = parseFloat(payment?.payment_amount);
      message = "The venue owner canceled, full refund applies.";
    } else {
      refundPercentage = valid_for_cancellation?.amount;
      refundAmount = parseFloat(payment?.payment_amount) * parseFloat(valid_for_cancellation?.amount);
      message = valid_for_cancellation?.message;
    }

    const result = {
      percentage: refundPercentage,
      allowed: valid_for_cancellation?.allowed,
      grand_total: payment.payment_amount,
      currency: payment.payment_currency,
      status: payment.status,
      refund_amount: refundAmount,
    };
    return { result, message };
  }
}
