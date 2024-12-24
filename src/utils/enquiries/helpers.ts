import dayjs from "dayjs";
import { ObjectId } from "mongodb";

import { user_role } from "../../models/user.model";

export const formatTimestamp = (date: any) => {
  const { timestamp, from, to } = date;
  const parsedTimestamp = dayjs(timestamp);
  const [fromHours, fromMinutes] = from.split(":").map(Number);
  const [toHours, toMinutes] = to.split(":").map(Number);

  const parsedFrom = parsedTimestamp.set("hour", fromHours).set("minute", fromMinutes);
  const parsedTo = parsedTimestamp.set("hour", toHours).set("minute", toMinutes);

  if (!parsedTimestamp.isValid() || !parsedFrom.isValid() || !parsedTo.isValid()) {
    return "Invalid Date";
  }

  const start = parsedFrom.format("dddd, D MMMM YYYY [at] HH:mm");
  const end = parsedTo.format("HH:mm");

  return `${start} - ${end}`;
};

export const extractTime = (dateString: string) => {
  const date = new Date(dateString);
  return date.toISOString().substr(11, 5);
};

export const constructQuery = (params: any, user: any, userId: any, togglePastCurrent: boolean, venues: any) => {
  const { space_id, search_name, event_type, guests, event_date, venue_id, enquiry_id, status } = params;

  const query: any = {};

  if (space_id) {
    query["space._id"] = new ObjectId(space_id);
  }

  if (search_name) {
    const nameParts: string[] = search_name.split(" ").filter((part: string) => part.trim() !== "");
    if (nameParts.length === 1) {
      query["$or"] = [
        { "user.first_name": { $regex: nameParts[0], $options: "i" } },
        { "user.last_name": { $regex: nameParts[0], $options: "i" } },
        { "space.name": { $regex: nameParts[0], $options: "i" } },
        { "venue.name": { $regex: nameParts[0], $options: "i" } },
      ];
    } else if (nameParts.length >= 2) {
      query["$or"] = [
        { "user.first_name": { $regex: nameParts[0], $options: "i" } },
        { "user.last_name": { $regex: nameParts[1], $options: "i" } },
        { "space.name": { $regex: nameParts.join(" "), $options: "i" } },
        { "venue.name": { $regex: nameParts.join(" "), $options: "i" } },
        { $and: [{ "user.first_name": { $regex: nameParts[0], $options: "i" } }, { "user.last_name": { $regex: nameParts[1], $options: "i" } }] },
      ];
    }
  }

  if (event_type) {
    query.type = event_type;
  }

  if (guests) {
    query.guests = Number(guests);
  }

  if (event_date) {
    query["date.date"] = event_date;
  }

  if (venue_id) {
    query.venue = new ObjectId(venue_id);
  }

  if (enquiry_id) {
    query._id = new ObjectId(enquiry_id);
  }

  if (status) {
    const statusStrings = status as string;
    const statusArray = statusStrings.split(",");
    if (!statusStrings.includes("ALL")) {
      query.status = { $in: statusArray };
    }
  }

  if ([user_role.VENUE_OWNER].includes(user?.role)) {
    query["organization"] = user.organization;
  } else if ([user_role.USER].includes(user?.role)) {
    query["user._id"] = userId;
  }

  const currentDate = new Date();

  if (togglePastCurrent === true) {
    query["date.timestamp.start_date_time"] = { $gte: currentDate };
  } else if (togglePastCurrent === false) {
    query["date.timestamp.start_date_time"] = { $lt: currentDate };
  }

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
