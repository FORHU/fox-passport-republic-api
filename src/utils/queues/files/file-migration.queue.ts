import { randomBytes } from "crypto";
import fs from "fs";

import FileSvc from "../../../services/file.service";
import { copyFile } from "../../../utils/aws";
import { extractS3KeyFromUrl } from "../../../utils/helpers";
import { logger } from "../../../utils/logger";
import { createQueue } from "../index";

// Initialize the queue
export const fileQueue = createQueue("process_files");

const limit = 200;

const fileJobs = async () => {
  // const query = {
  //   path: { $regex: "https://venue-4-use.s3.ap-southeast-1.amazonaws.com" },
  // };
  const query = { origin: { $ne: "DO" } };
  const total = await FileSvc.countFiles(query);
  for (let offset = 0; offset < total; offset += limit) {
    const buffer = randomBytes(16);
    const jobId = buffer.toString("hex");
    logger.log({
      level: "info",
      message: "[file status]: Add each batch to the queue",
    });
    await fileQueue.add("process_files", { query, offset, limit }, { jobId: `batch-${jobId}`, attempts: 3 });
  }
};

// // Queue processor
fileQueue.process("process_files", async (job: any, done: any) => {
  try {
    const { query, offset, limit } = job.data;
    logger.log({
      level: "info",
      message: "[Enquiry status]: Process the current batch",
    });
    const files = await FileSvc.getFilesLocation(query, offset, limit);
    for (const doc of files) {
      const fileUrl = doc.path;

      if (fileUrl) {
        const file_id = doc._id;
        const s3Key = extractS3KeyFromUrl(fileUrl);
        console.log({ s3Key });
        try {
          const results = await copyFile(s3Key);
          if (results.$metadata.httpStatusCode === 200) {
            await FileSvc.updateFiles({ _id: file_id }, { path: results.Location, origin: "DO" });
            console.log(`Successfully copied: ${s3Key}`);
          }
        } catch (error) {
          const errorDetails = `Failed to copy file with ID: ${file_id} and path: ${fileUrl}\n`;
          fs.appendFileSync("failed_files_log.txt", errorDetails);
        }
      }
    }

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
export const initFileQueue = async () => {
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
