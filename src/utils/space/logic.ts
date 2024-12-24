import { WeekdaysType } from "../../models/pricing.model";

export const updateOpeningHoursPreview = (data: any): void => {
  if (data.pricing && data.pricing.custom_price && data.pricing.custom_price.prices) {
    const openingHoursPreview: any = {};

    for (const day of Object.values(WeekdaysType)) {
      openingHoursPreview[day] = { from: "23:59", to: "00:00" };
    }

    data.pricing.custom_price.prices.forEach((price: any) => {
      price.weekdays.forEach((day: any) => {
        if (price.time && price.time.from && price.time.to) {
          if (price.time.from < openingHoursPreview[day].from) {
            openingHoursPreview[day].from = price.time.from;
          }
          if (price.time.to > openingHoursPreview[day].to) {
            openingHoursPreview[day].to = price.time.to;
          }
        }
      });
    });

    data.pricing.custom_price.opening_hours_preview = openingHoursPreview;
  }
};

export const getAvailableTimeSlots = (openingHours: { from: any; to: any }, bookings: any[], startTime: any, endTime: any) => {
  const openingStart = new Date(`1970-01-01T${openingHours.from}Z`).getTime();
  const openingEnd = new Date(`1970-01-01T${openingHours.to}Z`).getTime();
  const start = new Date(`1970-01-01T${startTime}Z`).getTime();
  const end = new Date(`1970-01-01T${endTime}Z`).getTime();
  const durationMs = end - start;

  const bookingRanges = bookings.map((booking) => ({
    start: new Date(booking.start_date).getTime() % (24 * 60 * 60 * 1000),
    end: new Date(booking.end_date).getTime() % (24 * 60 * 60 * 1000),
  }));

  bookingRanges.sort((a, b) => a.start - b.start);

  const availableSlots = [];
  let currentStart = openingStart;

  while (currentStart + durationMs <= openingEnd) {
    let isAvailable = true;

    bookingRanges.forEach((booking) => {
      if (currentStart < booking.end && currentStart + durationMs > booking.start) {
        isAvailable = false;
      }
    });

    if (isAvailable) {
      availableSlots.push({
        from: new Date(currentStart).toISOString().substring(11, 16),
        to: new Date(currentStart + durationMs).toISOString().substring(11, 16),
      });
    }

    currentStart += durationMs;
  }

  return availableSlots;
};

const timeStringToMinutes = (time: string): number => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

export const isSlotWithinAvailableSlot = (
  availableSlot: {
    start: string;
    end: string;
  },

  enteredSlot: {
    from: string;
    to: string;
  },
): boolean => {
  const availableStart = timeStringToMinutes(availableSlot.start);
  const availableEnd = timeStringToMinutes(availableSlot.end);
  const enteredStart = timeStringToMinutes(enteredSlot.from);
  const enteredEnd = timeStringToMinutes(enteredSlot.to);

  const spansMidnight = availableEnd < availableStart;

  let isWithinSlot: any;
  if (spansMidnight) {
    isWithinSlot = (enteredStart >= availableStart && enteredEnd <= 1440) || (enteredStart >= 0 && enteredEnd <= availableEnd);
  } else {
    isWithinSlot = enteredStart >= availableStart && enteredEnd <= availableEnd;
  }

  return isWithinSlot;
};
