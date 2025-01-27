import { randomBytes } from "crypto";

import BookingSvc from "../../../services/booking.service";
import EnquirySvc from "../../../services/enquiries.service";
import { logger } from "../../../utils/logger";
import { createQueue } from "../index";

// Initialize the queue
export const enquiryQueue = createQueue("process_enquiries");

const limit = 200;

const baseQuery = {
  "date.timestamp.end_date_time": { $lt: new Date() },
};

const confirmedQuery = {
  ...baseQuery,
  status: { $in: ["BOOKING_CONFIRMED"], $ne: "HAPPENED" },
};

const cancelledQuery = {
  ...baseQuery,
  status: { $nin: ["HAPPENED", "CANCELLED", "ARCHIVED", "BOOKING_CONFIRMED"] },
};

const enqueueJobs = async (query: any, newStatus: string) => {
  const enquiryCount = await EnquirySvc.getTotalCountEnquiry(query);
  for (let offset = 0; offset < enquiryCount; offset += limit) {
    const buffer = randomBytes(16);
    const jobId = buffer.toString("hex");
    logger.log({
      level: "info",
      message: "[Enquiry status]: Add each batch to the queue",
    });
    enquiryQueue.add("process_enquiries", { query, newStatus, offset, limit }, { jobId: `batch-${jobId}`, attempts: 3 });
  }
  return true;
};

// Queue processor
enquiryQueue.process("process_enquiries", async (job: any, done: any) => {
  try {
    const { query, newStatus, offset, limit } = job.data;
    logger.log({
      level: "info",
      message: "[Enquiry status]: Process the current batch",
    });
    query["date.timestamp.end_date_time"].$lt = new Date(query["date.timestamp.end_date_time"].$lt);
    const enquiries = await EnquirySvc.getEnquiries(query, offset, limit);
    const updatePromises = enquiries.map(async (enquiry) => {
      const [booking] = await BookingSvc.getBookings({ enquiry: enquiry._id }, 0, 10);
      if (booking) {
        await BookingSvc.updateBooking(booking._id, { status: newStatus });
      }
      return EnquirySvc.updateEnquiry({ _id: enquiry._id }, { status: newStatus, updatedAt: new Date() });
    });
    await Promise.all(updatePromises);

    logger.log({
      level: "info",
      message: "[Enquiry status]: update success.",
    });
    done();
  } catch (error: any) {
    logger.log({
      level: "error",
      message: `[Enquiry status]: Failed to process enquiry: ${error?.message}`,
    });
    done(new Error("Failed to process enquiry"));
  }
});

// Initialize and schedule the enquiry jobs
export const initEnquiriesQueue = async () => {
  try {
    await Promise.allSettled([enqueueJobs(confirmedQuery, "HAPPENED"), enqueueJobs(cancelledQuery, "ARCHIVED")]);
    logger.log({
      level: "info",
      message: "[Enquiry status] update processing jobs scheduled.",
    });
  } catch (error: any) {
    console.log({ error });
    logger.log({
      level: "error",
      message: `[Enquiry status]: Failed to initialize enquiry jobs: ${error?.message}`,
    });
  }
};
