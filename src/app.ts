// src/app.ts
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import router from "./routes";
import eventRoutes from "./routes/event.routes";
import { isDev } from "./config";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import setup from "./setup";

const app = express();

app.set("trust proxy", 1);

// UPDATED: Specific origin is required for credentials: true
app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  })
);

app.use(express.json());

// Request Logger
app.use((req, res, next) => {
  console.log(`📨 ${req.method} ${req.path}`);
  next();
});

// Rate Limiter
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
});

if (!isDev) app.use(limiter);

app.use(helmet());
app.disable("x-powered-by");

// Initialize setup
setup();

app.use("/api", router);
console.log("✅ Main router mounted"); // ← ADD THIS

const server = createServer(app);

export const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

export default server;
