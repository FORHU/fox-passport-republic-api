// import { createBullBoard } from "@bull-board/api";
// import { BullAdapter } from "@bull-board/api/bullAdapter";
import { ExpressAdapter } from "@bull-board/express";
import cors from "cors";
import express from "express";
import ExpressMongoSanitize from "express-mongo-sanitize";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { createServer } from "http";
import { Server } from "socket.io";

import { isDev, RATE_LIMITER } from "./config";
import events from "./events";
import router from "./routes";
import setup from "./setup";

const app = express();

const serverAdapter = new ExpressAdapter();


serverAdapter.setBasePath("/admin/queues");
app.use("/admin/queues", serverAdapter.getRouter());

// Middleware
app.use(cors({ origin: "*", credentials: true }));
app.use(express.json());
app.use(ExpressMongoSanitize());
app.use(helmet());
app.disable("x-powered-by");

app.get("/", (req, res) => {
  res.json({ message: "API is running!" });
});

// Rate limiting
if (!isDev) {
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: RATE_LIMITER,
  });
  app.use(limiter);
}

app.use("/api", router);

// Initiate jobs
setup();

// Create HTTP server and Socket.IO
const server = createServer(app);
export const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// WebSocket events
events(io);

export default server;
