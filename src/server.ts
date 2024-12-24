import { PORT } from "./config";
import { connectToMongo } from "./utils/mongo";
import { logger } from "./utils/logger";

connectToMongo()
  .then(() => {
    logger.log({
      level: "info",
      message: "Connected to MongoDB.",
    });

    const app = require("./app").default;

    app.listen(PORT, () => {
      logger.log({
        level: "info",
        message: `Server is running on http://localhost:${PORT}`,
      });
    });
  })
  .catch((err) => {
    console.log(err);
  });
