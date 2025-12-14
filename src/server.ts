import server from "./app";
import { PORT } from "./config";
import { logger } from "./utils/logger";
import { connectToMongo } from "./utils/mongo";

connectToMongo()
  .then(() => {
    logger.log({ level: "info", message: "Connected to MongoDB" });

    server.listen(PORT || 3000, () => {
      logger.log({
        level: "info",
        message: `Server is running on http://localhost:${PORT || 3000}`,
      });
    });
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err);
  });
