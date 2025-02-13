import { randomBytes } from "crypto";

import SpaceRepo from "../../../repositories/space.repository";
import UserRepo from "../../../repositories/user.repository";
import CountrySettingsRepo from "../../../repositories/country-setting.repository";
import FileSvc from "../../../services/file.service";
import { deleteSpaceFile } from "../../aws";
import { extractFilePath } from "../../helpers";
import { logger } from "../../logger";
import { createQueue } from "../index";

// Initialize the queue
export const removeFileQueue = createQueue("process_remove_file_queue");

const fileJobs = async () => {
  const buffer = randomBytes(16);
  const jobId = buffer.toString("hex");
  const query = {};
  logger.log({
    level: "info",
    message: "[file status]: Add each batch to the queue",
  });
  await removeFileQueue.add("process_remove_file_queue", { query }, { jobId: `batch-${jobId}`, attempts: 3 });
};

// Queue processor
removeFileQueue.process("process_remove_file_queue", async (job: any, done: any) => {
  try {
    const { query } = job.data;
    logger.log({
      level: "info",
      message: "[Enquiry status]: Process the current batch",
    });
    const allFiles = await FileSvc.handleGetFiles(query);
    const allFileIds = allFiles.map((file) => file._id.toString());

    const spaces = await SpaceRepo.handeGetSpacesPhotos({});
    const usedFileIds = spaces.length ? spaces[0].usedFileIds.map((id: any) => id.toString()) : [];

    const countrySettings = await CountrySettingsRepo.handeCountrySettingsPhotos({});
    const countrySettingFileIds = countrySettings.length ? countrySettings[0].usedFileIds.map((id: any) => id.toString()) : [];

    const users = await UserRepo.handleGetUsersV2({});
    const userFileIds = users.map((user) => user.profile_picture?.toString()).filter(Boolean);

    const allUsedFileIds = new Set([...usedFileIds, ...userFileIds, ...countrySettingFileIds]);
    const unusedFiles = allFileIds.filter((id) => !allUsedFileIds.has(id));
    for (const unusedFileId of unusedFiles) {
      const file = await FileSvc.getFileById(unusedFileId);
      if (file) {
        const filePath = extractFilePath(file.path);
        console.log({ filePath });
        await Promise.allSettled([deleteSpaceFile(filePath), FileSvc.deleteFilesById(unusedFileId)]);
        console.log(`Deleted unused file: ${unusedFileId}`);
      }
    }

    console.log("Unused file deletion completed!");

    logger.log({
      level: "info",
      message: "[File status]: update success.",
    });
    done();
  } catch (error: any) {
    logger.log({
      level: "error",
      message: `[File status]: Failed to process enquiry: ${error?.message}`,
    });
    done(new Error("Failed to process enquiry"));
  }
});

// Initialize and schedule the enquiry jobs
export const initRemoveFileQueue = async () => {
  try {
    await fileJobs();
    logger.log({
      level: "info",
      message: "[File status] update processing jobs scheduled.",
    });
  } catch (error: any) {
    logger.log({
      level: "error",
      message: `[File status]: Failed to initialize enquiry jobs: ${error?.message}`,
    });
  }
};
