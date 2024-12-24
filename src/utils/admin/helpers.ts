import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { ObjectId } from "mongodb";
import xlsx from "xlsx";

import { enquiry_status } from "../../models/enquiries.model";
dayjs.extend(customParseFormat);

export const createRegexPatterns = (input: string) => {
  return input.split(",").map((item: string) => new RegExp(item.trim(), "i"));
};

const validEnquiryStatuses = Object.values(enquiry_status);

function enquiryStatus(status: any): boolean {
  if (Array.isArray(status)) {
    return status.every((s) => validEnquiryStatuses.includes(s));
  } else if (typeof status === "string") {
    return status
      .split(",")
      .map((s) => s.trim())
      .every((s: any) => validEnquiryStatuses.includes(s));
  }
  return false;
}

export const constructEnquiryQuery = (params: any) => {
  const { space_id, venue_id, venues, enquiry_id, status, toggle_censor, toggle_current, search_name, event_type, guests, event_date } = params;

  const query: any = {};

  let censorPhoneNumber = false;
  if (toggle_censor === "true") {
    censorPhoneNumber = true;
  }

  let togglePastCurrent = null;
  if (toggle_current === "true") {
    togglePastCurrent = true;
  } else if (toggle_current === "false") {
    togglePastCurrent = false;
  }

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

  if (venues) {
    if (venues !== "ALL") {
      const venueIds = venues.map((venue: string) => new ObjectId(venue));
      query.venue = { $in: venueIds };
    }
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

  query["deletedAt"] = { $eq: null };

  const currentDate = new Date();

  if (togglePastCurrent === true) {
    query["date.timestamp.start_date_time"] = { $gte: currentDate };
  } else if (togglePastCurrent === false) {
    query["date.timestamp.start_date_time"] = { $lt: currentDate };
  }

  return query;
};

export const parseWorkbook = (workbook: xlsx.WorkBook): Record<string, any[]> => {
  const sheetsData: Record<string, any[]> = {};
  workbook.SheetNames.forEach((sheetName) => {
    const sheetData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" });
    sheetsData[sheetName] = sheetData;
  });
  return sheetsData;
};

export const validateSheetsData = (sheetsData: Record<string, any[]>): void => {
  const requiredFields = ["Venue Name", "Address", "Venue Listing"];

  for (const sheetName in sheetsData) {
    sheetsData[sheetName].forEach((dataRow, index) => {
      const rowKeys = Object.keys(dataRow);
      requiredFields.forEach((field) => {
        if (!rowKeys.includes(field)) {
          throw new Error(`Missing property "${field}" in sheet "${sheetName}", row ${index + 1}`);
        }
      });
    });
  }
};
