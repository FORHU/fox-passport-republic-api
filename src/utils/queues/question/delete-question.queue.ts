import { randomBytes } from "crypto";
import { ObjectId } from "mongodb";

import VenueSvc from "../../../services/venue.service";
import { logger } from "../../../utils/logger";
import { getDB } from "../../mongo";
import { createQueue } from "../index";

// Initialize and schedule the enquiry jobs
export const initQuestionQueue = async () => {
  try {
    await deleteUnusedQuestions();
    logger.log({
      level: "info",
      message: "[File status] update processing jobs scheduled.",
    });
  } catch (error: any) {
    logger.log({
      level: "error",
      message: `[File status]: Failed to initialize delete question jobs: ${error?.message}`,
    });
  }
};
export const questionDeletionQueue = createQueue("delete_unused_questions");

async function deleteUnusedQuestions() {
  try {
    const venues = await VenueSvc.getVenue({});

    for (const venue of venues) {
      const buffer = randomBytes(16);
      const jobId = buffer.toString("hex");
      await questionDeletionQueue.add("process_questions_deletion", { venue_id: venue._id }, { jobId: `batch-${jobId}`, attempts: 3 });
    }

    // Process questions for spaces
    const spaceCollection = getDB().collection("spaces");
    const spaces = await spaceCollection.find().toArray();

    for (const space of spaces) {
      const buffer = randomBytes(16);
      const jobId = buffer.toString("hex");
      await questionDeletionQueue.add("process_questions_deletion", { space_id: space._id }, { jobId: `batch-${jobId}`, attempts: 3 });
    }
  } catch (error) {
    logger.log({ level: "error", message: `Failed to process question deletion: ${error.message}` });
  }
}

// Queue processor for deleting unused questions
questionDeletionQueue.process("process_questions_deletion", async (job: any, done: any) => {
  try {
    const { venue_id, space_id } = job.data;
    const dummyQuestion = getDB().collection("questions");

    // Set the match condition based on venue_id or space_id
    const matchCondition = venue_id ? { venue_id: new ObjectId(venue_id) } : { space_id: new ObjectId(space_id) };

    const list = await dummyQuestion
      .aggregate([
        { $match: matchCondition },
        {
          $lookup: {
            from: venue_id ? "venues" : "spaces",
            localField: venue_id ? "venue_id" : "space_id",
            foreignField: "_id",
            as: "related",
          },
        },
        { $unwind: "$related" },
        {
          $project: {
            _id: 1,
            question: 1,
            isExcluded: {
              $or: [
                { $in: ["$_id", { $ifNull: [venue_id ? "$related.foods_and_beverages" : "$related.capacity_layout", []] }] },
                { $in: ["$_id", { $ifNull: [venue_id ? "$related.venue_details" : "$related.features", []] }] },
              ],
            },
          },
        },
        { $match: { isExcluded: { $ne: true } } },
      ])
      .toArray();

    const unusedIds = list.map((doc) => doc._id);
    const result = await dummyQuestion.deleteMany({ _id: { $in: unusedIds } });

    logger.log({ level: "info", message: `Deleted ${result.deletedCount} unused questions.` });

    done();
  } catch (error) {
    logger.log({ level: "error", message: `Failed to process question deletion: ${error.message}` });
    done(new Error("Failed to process question deletion"));
  }
});
