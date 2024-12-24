/* eslint-disable indent */
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { ObjectId } from "mongodb";

import { dateFormatter } from "../helpers";

dayjs.extend(utc);
dayjs.extend(timezone);
export enum DateFilter {
  THIS_MONTH = "this_month",
  NEXT_MONTH = "next_month",
  LAST_MONTH = "last_month",
  THREE_MONTHS_AGO = "three_months_ago",
  ONE_YEAR_AGO = "one_year_ago",
  THIS_YEAR = "this_year",
  NEXT_3_MONTHS = "next_3_months",
}

export const getDateRange = (filter: DateFilter): [Date, Date] => {
  const currentDate = new Date();
  let startDate, endDate;

  switch (filter) {
    case DateFilter.THIS_MONTH:
      startDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      endDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59, 999);
      break;
    case DateFilter.NEXT_MONTH:
      startDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
      endDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 2, 0, 23, 59, 59, 999);
      break;
    case DateFilter.LAST_MONTH:
      startDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
      endDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 0, 23, 59, 59, 999);
      break;
    case DateFilter.THREE_MONTHS_AGO:
      startDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 3, 1);
      endDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 0, 23, 59, 59, 999);
      break;
    case DateFilter.ONE_YEAR_AGO:
      startDate = new Date(currentDate.getFullYear() - 1, currentDate.getMonth(), 1);
      endDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 0, 23, 59, 59, 999);
      break;
    case DateFilter.THIS_YEAR:
      startDate = new Date(currentDate.getFullYear(), 0, 1);
      endDate = new Date(currentDate.getFullYear(), 11, 31, 23, 59, 59, 999);
      break;
    case DateFilter.NEXT_3_MONTHS:
      startDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      endDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 3, 0, 23, 59, 59, 999);
      break;
    default:
      throw new Error("Invalid date filter");
  }

  return [startDate, endDate];
};

export const getRepeatedDates = (start_date: any, repeat_event: any, startTime: any) => {
  const repeatDates: dayjs.Dayjs[] = [];

  const intervals: any = {
    DAILY: { unit: "day", count: 7 },
    WEEKLY: { unit: "week", count: 7 },
    MONTHLY: { unit: "month", count: 12 },
    YEARLY: { unit: "year", count: 10 },
  };
  for (const dateString of start_date) {
    const fullStartDateTime = `${dateString} ${startTime}`;
    const parsedDate = dayjs.tz(fullStartDateTime, "DD/MM/YYYY HH:mm", "UTC");
    repeatDates.push(parsedDate);

    if (repeat_event !== "DOES_NOT_REPEAT" && intervals[repeat_event]) {
      const { unit, count } = intervals[repeat_event];
      for (let i = 1; i < count; i++) {
        repeatDates.push(parsedDate.add(i, unit));
      }
    }
  }

  return repeatDates;
};

export const constructQuery = (filter: any, venues: any) => {
  const { start_date, from, to, booking_id, space_id, venue_id, booked_user, status, booker, event_duration, event_type } = filter;

  let query: any = {};

  const new_start_date = dateFormatter(start_date);

  if (start_date) {
    const start_time = from ? from : "00:00";
    const end_time = to ? to : "23:59";
    const startDate = new Date(`${new_start_date}T${start_time}:00.000Z`);
    const endDate = new Date(`${new_start_date}T${end_time}:00.000Z`);
    const nextDayEndDate = new Date(endDate);
    nextDayEndDate.setDate(endDate.getDate() + 1);

    query = {
      $or: [
        {
          $and: [{ start_date: { $lte: endDate } }, { end_date: { $gte: startDate } }],
        },
        {
          $and: [{ start_date: { $lte: nextDayEndDate } }, { end_date: { $gte: startDate } }],
        },
      ],
    };
  }

  if (booking_id) query._id = new ObjectId(booking_id);
  if (space_id) query["space._id"] = new ObjectId(space_id);
  if (venue_id) query.venue = new ObjectId(venue_id);
  if (booked_user) query.booked_user = new ObjectId(booked_user);
  if (status) query["status"] = status;
  if (booker) query.booker = booker;
  if (event_duration) query.event_duration = event_duration;
  if (event_type) query.event_type = event_type;

  if (venues) {
    if (Array.isArray(venues)) {
      query["venue._id"] = { $in: venues.map((id: string) => new ObjectId(id)) };
    } else if (typeof venues === "object") {
      if (venues.organization) {
        query["venue.organization"] = venues.organization;
      }
    }
  }

  query["deletedAt"] = { $eq: null };

  return query;
};
