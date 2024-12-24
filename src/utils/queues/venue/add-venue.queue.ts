import { randomBytes } from "crypto";
import { ObjectId } from "mongodb";
import xlsx from "xlsx";

import { space_status } from "../../../models/space.model";
import { venue_status } from "../../../models/venue.models";
import SpaceRepo from "../../../repositories/space.repository";
import VenueRepo from "../../../repositories/venue.repository";
import { logger } from "../../../utils/logger";
import { extractAddressComponents } from "../../../utils/venue/helper";
import { createQueue } from "../index";

// Initialize the queue
export const addVenueQueue = createQueue("process_add_venue");

const addVenueJobs = async (file: any) => {
  const workbook = xlsx.read(file, { type: "buffer" });

  const sheetsData: Record<string, any[]> = {};

  workbook.SheetNames.forEach((sheetName) => {
    const sheetData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
    sheetsData[sheetName] = sheetData;
  });

  const sheetKeys = Object.keys(sheetsData);

  sheetKeys.forEach(async (key) => {
    for (const data of sheetsData[key]) {
      const venue_name = data["Venue Name"];
      const address = extractAddressComponents(data["Address"]);
      const space_name = data["Venue Listing"];
      const buffer = randomBytes(16);
      const jobId = buffer.toString("hex");
      await addVenueQueue.add(
        "process_add_venue",
        {
          venue_name,
          lower_case_venue_name: venue_name?.toLowerCase(),
          address,
          space_name: space_name,
          lower_case_space_name: space_name?.toLowerCase(),
        },
        { jobId: `batch-${jobId}`, attempts: 3 },
      );
    }
  });
};

// Queue processor
addVenueQueue.process("process_add_venue", async (job: any, done: any) => {
  try {
    const { venue_name, lower_case_venue_name, lower_case_space_name, address, space_name } = job.data;

    const venue = await VenueRepo.getVenue({ name_lower_case: lower_case_venue_name });

    if (!venue) {
      const venueId = new ObjectId();
      const venuePayload = {
        _id: venueId,
        name: venue_name,
        name_lower_case: lower_case_venue_name,
        status: venue_status.PENDING,
        address: address || null,
        is_extracted: true,
      };

      const spacePayload = {
        name: space_name,
        name_lower_case: lower_case_space_name,
        venue: venueId,
        status: space_status.PENDING,
        is_extracted: true,
      };

      await Promise.allSettled([VenueRepo.createVenue(venuePayload), SpaceRepo.createSpaces(spacePayload)]);
    } else {
      const space = await SpaceRepo.getSpace({ name_lower_case: lower_case_space_name });
      if (!space) {
        await SpaceRepo.createSpaces({
          name: space_name,
          name_lower_case: lower_case_space_name,
          venue: venue._id,
          status: space_status.PENDING,
          is_extracted: true,
        });
      }
    }

    done();
  } catch (error: any) {
    logger.log({
      level: "error",
      message: `[File status]: Failed to process add venue: ${error?.message}`,
    });
    done(new Error("Failed to process add venue"));
  }
});

// Initialize and schedule the enquiry jobs
export const initAddVenueQueue = async (file: any) => {
  try {
    await addVenueJobs(file);
    logger.log({
      level: "info",
      message: "[add venue] update processing jobs scheduled.",
    });
  } catch (error: any) {
    logger.log({
      level: "error",
      message: `[add venue]: Failed to initialize add venue jobs: ${error?.message}`,
    });
  }
};
