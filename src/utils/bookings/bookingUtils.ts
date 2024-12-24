import dayjs from "dayjs";
import BookingSvc from "../../services/booking.service";
import PricingSvc from "../../services/pricing.service";
import { logger } from "../../utils/logger";

export function calculateDuration(startDate: string, endDate: string): number {
  const start = dayjs(startDate);
  const end = dayjs(endDate);
  const duration = end.diff(start, "hour", true);
  return Math.round(duration);
}

export function aggregateHoursBySpace(bookings: any[]): { [spaceId: string]: number } {
  const hoursBySpace: { [spaceId: string]: number } = {};

  bookings.forEach((booking) => {
    const duration = calculateDuration(booking.start_date, booking.end_date);
    const spaceId = booking.space.toString();

    if (hoursBySpace[spaceId]) {
      hoursBySpace[spaceId] += duration;
    } else {
      hoursBySpace[spaceId] = duration;
    }
  });

  return hoursBySpace;
}

export function calculateTotalOpenHours(pricing: any[], dayOfWeek: string): { [spaceId: string]: number } {
  const totalHoursBySpace: { [spaceId: string]: number } = {};

  pricing.forEach((spacePricing: any) => {
    let totalHours = 0;
    const spaceId = spacePricing.space_id.toString();

    const hireFeeArray = Array.isArray(spacePricing.hire_fee?.days) ? spacePricing.hire_fee.days : [];
    if (spacePricing.selected_pricing === "HIRE_FEE" && hireFeeArray.length > 0) {
      hireFeeArray.forEach((fee: any) => {
        if (fee.name === dayOfWeek && fee.slots) {
          const start = fee.slots.start;
          const end = fee.slots.end;

          if (start && end) {
            const endAdjusted = end === "00:00" ? "24:00" : end;
            const duration = dayjs(endAdjusted, "HH:mm").diff(dayjs(start, "HH:mm"), "hour", true);
            totalHours += duration;
          }
        }
      });
    }

    const customPriceArray = Array.isArray(spacePricing.custom_price?.prices) ? spacePricing.custom_price.prices : [];
    if (spacePricing.selected_pricing === "CUSTOM_PRICE" && customPriceArray.length > 0) {
      customPriceArray.forEach((price: any) => {
        if (price.weekdays.includes(dayOfWeek)) {
          const duration = dayjs(price.time.to, "HH:mm").diff(dayjs(price.time.from, "HH:mm"), "hour", true);
          totalHours += duration;
        }
      });
    }

    totalHoursBySpace[spaceId] = Math.floor(totalHours);
  });

  return totalHoursBySpace;
}

export async function processBookingsAndPricing(start_date: string, dayOfWeek: string) {
  if (start_date) {
    try {
      const startTime = "06:00";
      const startBookingDate = new Date(`${start_date.split("T")[0]}T${startTime}:00.000Z`);
      const endBookingDate = new Date(`${dayjs(start_date).add(1, "day").format("YYYY-MM-DD")}T${startTime}:00.000Z`);
      const existingBookings = await BookingSvc.getAllBookings({
        start_date: { $gte: startBookingDate, $lt: endBookingDate },
        status: { $in: ["BOOKING_CONFIRMED", "CONFIRMED"] },
        deletedAt: { $eq: null },
        cancelledAt: { $eq: null },
      });
      const spaceIds = existingBookings.map((booking: any) => booking.space);

      const existingPricing = await PricingSvc.getPrices({
        space_id: { $in: spaceIds },
      });

      const pricingByDayOfWeek = calculateTotalOpenHours(existingPricing, dayOfWeek);
      const totalHoursBySpace = aggregateHoursBySpace(existingBookings);

      const filteredSpaces = Object.keys(totalHoursBySpace).filter((spaceId) => {
        return pricingByDayOfWeek[spaceId] <= totalHoursBySpace[spaceId];
      });
      return filteredSpaces;
    } catch (error) {
      logger.log({
        level: "error",
        message: `[SPACE]: SPACE FETCH ERROR: ${JSON.stringify(error)}`,
      });
      throw error;
    }
  } else {
    logger.log({
      level: "warn",
      message: `[SPACE]: No start date provided for processing bookings and pricing.`,
    });
    return [];
  }
}
